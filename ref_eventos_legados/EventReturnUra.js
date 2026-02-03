/**
 * Classe -> EventReturnUra
 * @desc: processamento de eventos de RETORNOURA
 **/

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeIVRReportPbxModel = require(path + '/model/pbx/report/RealtimeIVRReportPbxModel');

/**
 * Contrutora da classe de EventReturnUra
 * @constructor
 */
function EventReturnUra() {
    local = this;
}

EventReturnUra.prototype.EventReturnUraRealTime = EventReturnUraRealTime;
module.exports = EventReturnUra;

/**
 * Obtém dados do pbx em tempo real
 * @param $client
 * @returns {Promise|*}
 * @constructor
 */
async function EventReturnUraRealTime($event) {
    //log realtime
    /* logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
         'INICIO', "Processando evento de RETORNOURA!");*/

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
    return {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: true
    };
}
