

const path = require('app-root-path');
const realtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
const realtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
const clientRealtimeModel = require(path + '/model/pbx/client/ClientRealtimePbxModel');
const clientPbxModel = require(path + '/model/pbx/client/ClientPbxModel');
const branchStateClientPbxModel = require(path + '/model/pbx/client/BranchStateClientPbxModel');
const logpbx = require(path + '/library/LogPbx');
let mongoose = require('mongoose');

const getRealtimeClient = async (id, value, field = 'branch_number') => {
    let client_realtime =  await clientRealtimeModel.findOne({
        'client_id': id
    }, {
        "_id": 1,
        "central_id": 1,
        "name": 1,
        "client_id": 1,
        "date_last_auto_clear": 1,
        "active": 1,
        "pbx.realtime.settings": 1
    }).lean();

    if (!client_realtime || !value) {
        logpbx.Add('client_realtime não encontrado. Cancelando execução.');
        return;
    }
    let query = `pbx.${field}.${field === 'branch_number' ? 'number' : '_id'}`;
    let formatted_value = () => {
        if (field === 'branch_number' || value.includes('ativo') || value.includes('ramal')) return value.toString();
        return mongoose.Types.ObjectId(value)
    };

    let client_pbx = await clientPbxModel.findOne({_id: mongoose.Types.ObjectId(client_realtime.client_id),
        [query]: formatted_value()}, {
        "_id": 1,
        "name": 1,
        "central_id": 1,
        "sip_server": 1,
        [`pbx.${field}.$`]: 1,
    }).lean();

    if (!client_pbx) {
        logpbx.Add('cliente não encontrado. Cancelando execução.');
        return;
    }

    return client_pbx;

}

// Create Queue using the event object.
const createQueue = async (event) => {

    if (event.id_ext_fila.includes('ativo') || event.id_ext_fila.includes('ramal')) {
        let queue_name = event.id_ext_fila.includes('ativo') ? 'Fila Ativo' : 'Fila Ramal';
        let queueModel = await realtimeQueueReportPbxModel.findOneAndUpdate({
            "queue_id": event.id_ext_fila.toString(),
            "client_id": event.id_cliente_externo
        }, {
            "$set": {
                "client_id": event.id_cliente_externo,
                "queue_id": event.id_ext_fila,
                "queue_name": queue_name,
                "total_available": [],
                "total_logged": [],
                "total_pause": [],
                "total_transfer": 0,
                "calls_finalized_surpevisor": 0,
                "total_pause_scheduled": [],
                "total_monitoring": 0,
                "calls" : {
                    "waiting" : [],
                    "attendance" : []
                },
                "resume": {
                    "receptive": {
                        "sla_abandoned": 0,
                        "quantity_waiting": 0,
                        "quantity_attendance": 0,
                        "max_time_waiting": 0,
                        "max_time_call": 0,
                        "sum_quantity_call": 0,
                        "sum_quantity_attendance": 0,
                        "total_abandoned": 0,
                        "total_callback": 0,
                        "sum_time_waiting_attendance": 0,
                        "sum_time_waiting_abandoned": 0,
                        "quantity_waiting_abandoned": 0,
                        "sum_time_attendance": 0,
                        "sla_attendance_seconds": 0,
                        "quantity_attendance_seconds": 0,
                        "quantity_refused_attempts": 0,
                        "total_queueoverflow": 0,
                    },
                    "active": {
                        "quantity_dialing": 0,
                        "sum_quantity_call": 0,
                        "quantity_attendance": 0,
                        "sum_quantity_attendance": 0,
                        "total_abandoned": 0,
                        "max_time_call": 0,
                        "sum_time_attendance": 0,
                    }
                }
            }
        }, { "upsert": true, "new": true }).lean();

        return queueModel;
    }
    let client = await getRealtimeClient(event.id_cliente_externo, event.id_ext_fila, 'queue');
    if (!client || !client.pbx || !client.pbx.queue) return;
    let queue_from_client = client.pbx.queue[0];
    if (!queue_from_client) {
        logpbx.Add('queue não encontrada. Cancelando execução.');
        return;
    }
    return realtimeQueueReportPbxModel.findOneAndUpdate({
        "queue_id": queue_from_client._id.toString(),
        "client_id": client._id.toString()
    }, {
        "$set": {
            "client_id": event.id_cliente_externo,
            "queue_id": (event.id_ext_fila.includes('ativo') || event.id_ext_fila.includes('ramal'))
                ? event.id_ext_fila
                : queue_from_client._id.toString() || '',
            "queue_name": (event.id_ext_fila.includes('ativo') || event.id_ext_fila.includes('ramal'))
            ? event.id_ext_fila
            : queue_from_client.name || '',
            "total_available": [],
            "total_logged": [],
            "total_pause": [],
            "total_transfer": 0,
            "calls_finalized_surpevisor": 0,
            "total_pause_scheduled": [],
            "total_monitoring": 0,
            "calls" : {
                "waiting" : [],
                "attendance" : []
            },
            "resume": {
                "receptive": {
                    "sla_abandoned": 0,
                    "quantity_waiting": 0,
                    "quantity_attendance": 0,
                    "max_time_waiting": 0,
                    "max_time_call": 0,
                    "sum_quantity_call": 0,
                    "sum_quantity_attendance": 0,
                    "total_abandoned": 0,
                    "total_callback": 0,
                    "sum_time_waiting_attendance": 0,
                    "sum_time_waiting_abandoned": 0,
                    "quantity_waiting_abandoned": 0,
                    "sum_time_attendance": 0,
                    "sla_attendance_seconds": 0,
                    "quantity_attendance_seconds": 0,
                    "quantity_refused_attempts": 0,
                    "total_queueoverflow": 0,
                },
                "active": {
                    "quantity_dialing": 0,
                    "sum_quantity_call": 0,
                    "quantity_attendance": 0,
                    "sum_quantity_attendance": 0,
                    "total_abandoned": 0,
                    "max_time_call": 0,
                    "sum_time_attendance": 0,
                }
            }
        }
    }, { "upsert": true, "new": true }).lean();
};

// Create Agent using the event object.
const createAgent = async (event) => {
    let client = await getRealtimeClient(event.id_cliente_externo, event.originador, 'branch_number');
    if (!client || !client.pbx || !client.pbx.branch_number) {
        logpbx.Add('Cliente não encontrado.');
        return;
    }
    let branch_from_client = client.pbx.branch_number[0];
    if (!branch_from_client) {
        logpbx.Add('Ramal não foi encontrado no cliente.');
        return;
    };

    const branchStateMap = (await branchStateClientPbxModel.find({
        client_id: '' + client._id,
        branch_number: {
            $in: client.pbx.branch_number.map(e => e.number)
        }
    }).lean()).reduce((o, e) => (o[e.branch_number] = e, o), {});
    const state = branchStateMap[branch_from_client.number];
    if (state) {
        branch_from_client.status = state.status;
        branch_from_client.logged = state.logged;
        branch_from_client.paused = state.paused;
        branch_from_client.paused_code = state.paused_code;
        branch_from_client.logged_last_logout = state.logged_last_logout;
        branch_from_client.logged_last_login = state.logged_last_login;
    }

    if (!branch_from_client.logged) branch_from_client.status = "desconectado";

    let agent = {
        active_sum_time_attendance: 0,
        active_sum_time_waiting: 0,
        active_sum_total_calls: 0,
        active_sum_calls_attendance: 0,
        branch_number: branch_from_client.number,
        branch_mask: branch_from_client.mask,
        user_name: branch_from_client.user_name,
        user_id: branch_from_client.user_id,
        client_id: client._id,
        state: 'desconnected',
        login_state: false,
        registered_queues: [],
        queues: [],
        quantity_pause: 0,
        time_total_pause: 0,
        tme: 0,
        tma: 0,
        sum_time_waiting: 0,
        sum_time_attendance: 0,
        quantity_attendance: 0,
        quantity_call: 0,
        quantity_refused: 0,
        pause_state: false,
        paused_queues: [],
        schedule_paused_queues: [],
        active_pause_state: false,
    };

    if (branch_from_client.logged) {
        agent.login_state = true;
        agent.state = 'free';
        if (branch_from_client.paused) {
            agent.pause_state = true;
            agent.state = 'pause';
        }
        if (branch_from_client.status == 'ocupado') {
            agent.logout = undefined;
            agent.pause = undefined;
            agent.reason_pause = undefined;
            agent.in_call = true;
            agent.state = 'occupied';
            agent.active_pause_state = false;
        }
        else{
            agent.laze_time = undefined;
            agent.last_call = undefined;
            agent.last_queue = undefined;
            agent.call_id = undefined;
            agent.in_call = false;
            agent.duration_time = undefined;
            agent.duration_time_date = undefined;
            agent.phone_origin = undefined;
        }
    }
    else{
        agent.login = undefined;
        agent.logout = undefined;
        agent.pause = undefined;
        agent.reason_pause = undefined;
        agent.queues = [];
        agent.paused_queues = [];
        agent.schedule_paused_queues = [];
        agent.active_pause_state = false;
        agent.schedule_pause_state = false;
        agent.laze_time = undefined;
        agent.last_call = undefined;
        agent.last_queue = undefined;
        agent.call_id = undefined;
        agent.in_call = false;
        agent.duration_time = undefined;
        agent.duration_time_date = undefined;
        agent.phone_origin = undefined;
    }

    return realtimeAgentReportPbxModel.findOneAndUpdate({ "branch_number": agent.branch_number, "client_id": client._id.toString() }, { "$set": {...agent} }, { upsert: true, new: true }).lean();

}

module.exports = { createAgent, createQueue };
