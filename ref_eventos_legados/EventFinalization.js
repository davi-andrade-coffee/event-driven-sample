/**
 * Classe -> EventFinalization
 * @desc: processamento de evento de FINALIZACAO
 */

//imports
var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var promise = require("bluebird");
var logpbx = require(path + '/library/LogPbx');
var realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');

/**
 * Contrutora da classe de EventFinalization
 * @constructor
 */
function EventFinalization() {
    local = this;
}

EventFinalization.prototype.EventFinalizationRealTime = EventFinalizationRealTime;
module.exports = EventFinalization;

/**
 * Obtém dados do pbx em tempo real
 * @param $client
 * @returns {Promise|*}
 * @constructor
 */
async function EventFinalizationRealTime($event) {    
    //log realtime
    /*  logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento,
          'INICIO', "Processando evento de FINALIZACAO!");*/
    let final_return = {
        client_id: $event.id_cliente_externo,
        queues: [],
        agents: [],
        ivr: false
    };

    await realtimeQueueReportPbxModel.updateOne(
        {
            'client_id': $event.id_cliente_externo,
            'queue_id': $event.id_ext_fila
        },
        {
            $inc: {
                'calls_finalized_surpevisor': 1
            }
        });

    final_return.queues.push($event.id_ext_fila);

    return final_return;
}
