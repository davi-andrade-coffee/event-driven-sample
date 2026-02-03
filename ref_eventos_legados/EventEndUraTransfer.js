/**
 * Classe -> EventEndUra
 * @desc: processamento de eventos de FIMURATRANSFERENCIA
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeIVRReportPbxModel = require(path + '/model/pbx/report/RealtimeIVRReportPbxModel');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
var realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
const GetSettingsRealtimeByClientId = require(path  + "/business/pbx/client/SettingsRealtimeClientPbxBL/GetSettingsRealtimeByClientId");

/**
 * Contrutora da classe de EventEndUra
 * @constructor
 */
function EventEndUraTransfer() {
    local = this;
}

EventEndUraTransfer.prototype.EventEndUraTranferRealTime = EventEndUraTranferRealTime;
module.exports = EventEndUraTransfer;

/**
 * Obtém dados do pbx em tempo real
 * @param $event
 * @returns {Promise|*}
 * @constructor
 */
async function EventEndUraTranferRealTime($event) {
    //log realtime
    /*  logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
          'INICIO', "Processando evento de FIMURATRANSFERENCIA!");*/
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    var queue = null;
    if ($event.id_ext_fila) queue = await realtimeQueueReportPbxModel.findOne({'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}).lean();

    if (queue) {
        var call = _.find(queue.calls.waiting, {'call_id': $event.id_ligacao});
        if (call) {
            // Ligação não atendida
            if (queue.resume.receptive.max_time_waiting < Number($event.data2)) {
                queue.resume.receptive.max_time_waiting = $event.data2 ? parseInt($event.data2) : 0;
            }
            let realtime_settings = await GetSettingsRealtimeByClientId($event.id_cliente_externo);

            if (realtime_settings && Number($event.data2) <= realtime_settings.time_sla_attendance) {
                await realtimeQueueReportPbxModel.updateOne({
                    'client_id': $event.id_cliente_externo,
                    'queue_id': $event.id_ext_fila
                }, {
                    $set: {
                        'resume.receptive.max_time_waiting': queue.resume.receptive.max_time_waiting
                    },
                    $inc: {
                        'resume.receptive.quantity_waiting': -1,
                        'resume.receptive.sum_time_waiting_abandoned': Number($event.data2),
                        'resume.receptive.total_abandoned': 1,
                        'resume.receptive.sla_abandoned': 1
                    },
                    $pull: {
                        'calls.waiting': {call_id: $event.id_ligacao}
                    }
                });
            }
            else{
                await realtimeQueueReportPbxModel.updateOne({
                    'client_id': $event.id_cliente_externo,
                    'queue_id': $event.id_ext_fila
                }, {
                    $set: {
                        'resume.receptive.max_time_waiting': queue.resume.receptive.max_time_waiting
                    },
                    $inc: {
                        'resume.receptive.quantity_waiting': -1,
                        'resume.receptive.sum_time_waiting_abandoned': Number($event.data2),
                        'resume.receptive.total_abandoned': 1
                    },
                    $pull: {
                        'calls.waiting': {call_id: $event.id_ligacao}
                    }
                });
            }
            final_return.queues.push($event.id_ext_fila);
        }
        else {
            call = _.find(queue.calls.attendance, {'call_id': $event.id_ligacao});
            if (call) {
                await realtimeQueueReportPbxModel.updateOne({
                        'client_id': $event.id_cliente_externo,
                        'queue_id': $event.id_ext_fila
                    }, {
                        $pull: {
                            'calls.attendance': {call_id: $event.id_ligacao}
                        },
                        $inc: {
                            'resume.receptive.quantity_attendance': -1
                        }
                    });
                final_return.queues.push($event.id_ext_fila);
            }
        }
    }
    await realtimeIVRReportPbxModel.updateOne(
        {
            'client_id': $event.id_cliente_externo,
            'calls.ura': {
                $elemMatch: {
                    call_id: $event.id_ligacao,
                    end_ura: false
                }
            }
        },
        {
            $set: {
                'calls.ura.$.end_ura': true
            },
            $inc: {
                'quantity_ura': -1
            }
        });
    await realtimeIVRReportPbxModel.updateOne({
            'client_id': $event.id_cliente_externo
        }, {
            $pull: {
                'calls.ura': {call_id: $event.id_ligacao}
            }
        });
    final_return.ivr = true;
    return final_return;
}
