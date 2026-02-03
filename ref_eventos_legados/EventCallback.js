const path = require("app-root-path");
const logpbx = require(path + '/library/LogPbx');
const realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
const _ = require("lodash");

class EventCallback {
    async EventCallbackRealTime($event) {
        logpbx.Add(__filename.split(/[\\/]/).pop(), new Error().stack.split(":")[1], global.log_pbx.type.info, $event.id_cliente, $event.id_ligacao, $event.evento, 'INICIO', "Processando evento de CALLBACK!");
        const payload = {
            client_id: $event.id_cliente_externo, queues: [], agents: [], ivr: false
        };
        const queryMongodb = {'client_id': $event.id_cliente_externo, 'queue_id': $event.id_ext_fila}
        const queue = await realtimeQueueReportPbxModel.findOne(queryMongodb).lean();

        queryMongodb['calls.waiting.call_id'] =  $event.id_ligacao;

        if (queue) {
            payload.queues.push(queue.queue_id);

            let update = {
                $inc: {
                    'resume.receptive.total_callback': 1
                }
            }
            if (queue.resume.receptive && !queue.resume.receptive.hasOwnProperty("total_callback")) update = {
                $set: {
                    'resume.receptive.total_callback': 1
                }
            }

            await realtimeQueueReportPbxModel.updateOne(queryMongodb, {
                ...update,
                'calls.waiting.$.callback': true
            });
        }
        return payload;

    }

}

module.exports = EventCallback
