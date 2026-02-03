/**
 * Classe -> EventEnterQueue
 * @desc: processamento de evento de ENTRAFILA
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeIVRReportPbxModel = require(path + '/model/pbx/report/RealtimeIVRReportPbxModel');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');

/**
 * Contrutora da classe de EventEnterQueue
 * @constructor
 */
function EventEnterQueue() {
    local = this;
}

EventEnterQueue.prototype.EventEnterQueueRealTime = EventEnterQueueRealTime;
module.exports = EventEnterQueue;

/**
 * Obtém dados do pbx em tempo real
 * @param $event
 * @returns {Promise|*}
 * @constructor
 */
async function EventEnterQueueRealTime($event) {
    //log realtime
  /*  logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
        'INICIO', "Processando evento de ENTRAFILA!");*/
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    var queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();
    if (queue) {
        var call = {
            call_id: $event.id_ligacao,
            queue_name: queue.queue_name,
            queue: $event.id_ext_fila,
            number: $event.data3,
            origin: $event.originador,
            input: $event.hora,
            ura_time: $event.data2,
            waiting_time: $event.hora,
            channel: $event.data7
        };

        await realtimeQueueReportPbxModel.updateOne(
            {
                'client_id': $event.id_cliente_externo,
                'queue_id': $event.id_ext_fila
            },
            {
                $push: {
                    'calls.waiting': call
                },
                $inc: {
                    'resume.receptive.quantity_waiting': 1,
                    'resume.receptive.sum_quantity_call': 1
                }
            });
        final_return.queues.push($event.id_ext_fila);

        // Buscando chamada interna para remoção
        if ($event.fila !== `${$event.id_cliente}-agrupado`) {
            let queueRamal = await realtimeQueueReportPbxModel.updateOne({
                'client_id': $event.id_cliente_externo,
                'queue_id': $event.id_cliente + "-ramal",
                'calls.waiting.call_id': $event.id_ligacao
            }, {
                $inc: {
                    "resume.active.quantity_dialing": -1
                },
                $pull: {
                    'calls.waiting': {call_id: $event.id_ligacao}
                }
            });
            if (queueRamal) final_return.queues.push($event.id_cliente + "-ramal");
        }
    }

    let calls_ura = await realtimeIVRReportPbxModel.findOne({'client_id': $event.id_cliente_externo}).lean();
    let call_ura = _.find(calls_ura.calls.ura, {'call_id': $event.id_ligacao});

    if (call_ura && (call_ura.end_ura === false || call_ura.end_ura === 'false')) {
        await realtimeIVRReportPbxModel.updateOne({
                'client_id': $event.id_cliente_externo,
                'calls.ura.call_id': $event.id_ligacao
            }, {
                $inc: {
                    'quantity_ura': -1
                },
                $set: {
                    'calls.ura.$.end_ura': true
                }
            });
        final_return.ivr = true;
    }
    return final_return;
}
