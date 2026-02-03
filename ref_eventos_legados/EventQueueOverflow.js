/**
 * Classe -> EventQueueOverflow
 * @desc: processamento do evento de transbordo
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');

/**
 * Contrutora da classe de EventQueueOverflow
 * @constructor
 */
function EventQueueOverflow() {
    local = this;
}

EventQueueOverflow.prototype.EventQueueOverflowRealtime = EventQueueOverflowRealtime;
module.exports = EventQueueOverflow;

/**
 * Obtém dados do pbx em tempo real
 * @param $event
 * @returns {Promise|*}
 * @constructor
 */
async function EventQueueOverflowRealtime($event) {
    /*   logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
           'INICIO', "Processando evento de TRANSBORDO!");*/
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    let queue_original = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.data5}).lean();
    if (!queue_original) return final_return;
    var call = _.find(queue_original.calls.waiting, {'call_id': $event.id_ligacao});
    if (!call) return final_return;

    let queue = null;
    if($event.id_ext_fila && $event.id_ext_fila !== "") queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();

    await realtimeQueueReportPbxModel.updateOne(
        {
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.data5
        },
        {
            $pull: {
                'calls.waiting': {call_id: $event.id_ligacao}
            },
            $inc: {
                'resume.receptive.quantity_waiting': -1,
                'resume.receptive.total_queueoverflow': 1
            }
        });
    final_return.queues.push($event.data5);

    if (queue) {
        call.queueoverflow_queue = call.queue_name;
        call.queue_name = queue.queue_name;
        call.queue = $event.id_ext_fila;
        call.queueoverflow_time += Math.max(0, new Date($event.hora) - new Date(call.waiting_time));
        call.queueoverflow = true;
        call.waiting_time = $event.hora;
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
    }

    return final_return;
}
