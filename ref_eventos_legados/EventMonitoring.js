/**
 * Classe -> EventMonitoring
 * @desc: processamento de evento de MONITORIA
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');

/**
 * Contrutora da classe de EventMonitoring
 * @constructor
 */
function EventMonitoring() {
    local = this;
}

EventMonitoring.prototype.EventMonitoringRealTime = EventMonitoringRealTime;
module.exports = EventMonitoring;

/**
 * Processa evento de monitoria do realtime.
 * @param $event
 * @returns {Query|*}
 * @constructor
 */
async function EventMonitoringRealTime($event) {
  /*  logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
        'INICIO', "Processando evento de MONITORAMENTO!");*/

   /* logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
        'CONSULTA', "Buscando a fila! fila=" + $event.fila + " id_ext_fila=" + $event.id_ext_fila);*/
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };
    const queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();
    if (!queue) return final_return;

    const agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.originador}).lean();
    if (!agent) return final_return;

    if (agent.in_call) return;

    await realtimeQueueReportPbxModel.updateOne(
        {
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.id_ext_fila,
            'calls.attendance.call_id': $event.data2
        },
        {
            $inc: {
                'calls.attendance.$.total_monitoring': 1
            }
        });

    await realtimeAgentReportPbxModel.updateOne(
        {
            'client_id': $event.id_cliente_externo, 'branch_number': $event.originador
        },
        {
            $set: {
                'in_call': true
            }
        });

    final_return.queues.push($event.id_ext_fila);

    await promise.each(agent.queues, function (queue_value) {
        return promise.try(promiseSave)
            .catch(promiseErrorResult);

        function promiseSave() {
            if(!final_return.queues.includes(queue_value.queue_id)) final_return.queues.push(queue_value.queue_id);
            return realtimeQueueReportPbxModel.findOneAndUpdate(
                {
                    'client_id': $event.id_cliente_externo,
                    'queue_id': queue_value.queue_id
                },
                {
                    $pull: {
                        'total_available': agent.branch_number
                    }
                },
                {safe: true, upsert: false}).lean();
        }

        function promiseErrorResult(ex) {
            /*   logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.error, $event.id_cliente, $event.id_ligacao, $event.evento,
                   'promiseErrorResult', 'Processing error in the module');*/
            throw ex;
        }
    });

    return final_return;
}
