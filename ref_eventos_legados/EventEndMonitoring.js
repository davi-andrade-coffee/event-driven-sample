/**
 * Classe -> EventEndMonitoring
 * @desc: processamento de histórico e relatório de ligações.
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');


/**
 * Contrutora da classe de EventEndMonitoring
 * @constructor
 */
function EventEndMonitoring() {
    local = this;
}

EventEndMonitoring.prototype.EventEndMonitoringRealTime = EventEndMonitoringRealTime;
module.exports = EventEndMonitoring;

/**
 * Obtém dados do pbx em tempo real
 * @param $event
 * @returns {Promise|*}
 * @constructor
 */
async function EventEndMonitoringRealTime($event) {
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    let queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();

    if (!queue) return final_return;

    let agent = await realtimeAgentReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'branch_number': $event.originador}).lean();

    if (!agent) return final_return;

    await realtimeQueueReportPbxModel.updateOne(
        {
            'client_id': $event.id_cliente_externo,
            'calls.attendance.call_id': $event.data2,
            'queue_id': $event.id_ext_fila
        },
        {
            $inc: {
                'calls.attendance.$.total_monitoring': -1
            }
        });
    await realtimeAgentReportPbxModel.updateOne(
        {
            'client_id': $event.id_cliente_externo, 'branch_number': $event.originador
        },
        {
            $set: {
                'in_call': false
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
                    $addToSet: {
                        'total_available': agent.branch_number
                    }
                },
                {safe: true, upsert: false}).lean();
        }

        function promiseErrorResult(ex) {
           /* logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.error, $event.id_cliente, $event.id_ligacao, $event.evento,
                'promiseErrorResult', 'Processing error in the module');*/
            throw ex;
        }
    });

    return final_return;
}
