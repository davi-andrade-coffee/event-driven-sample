/**
 * Classe -> RealtimeReportPbxBL
 * @desc: processamento do realtime
 */

var local = null;
var _ = require('lodash');
var path = require('app-root-path');
var request = require('request-promise');
var promise = require("bluebird");
const axios = require('axios');
const mongoose = require('mongoose');
const { queue } = require('../../../model/pbx/AddressPbxModel');
var RealtimeIVRReportPbxModel = require(path + '/model/pbx/report/RealtimeIVRReportPbxModel');
var RealtimeSnapshotPbxModel = require(path + '/model/pbx/report/RealtimeSnapshotPbxModel');
var RealtimeQueueReportPbxModel = require(path + '/model/pbx/report/RealtimeQueueReportPbxModel');
const UserSettingsRealtimePbxModel = require(path + '/model/pbx/UserSettingsRealtimePbxModel');
var RealtimeAgentReportPbxModel = require(path + '/model/pbx/report/RealtimeAgentReportPbxModel');
const ReportInconsistencyRealtimePbxModel = require(path + '/model/pbx/ReportInconsistencyRealtimePbxModel');
const DisagreementsCountersRealtimeLogModel = require(path + '/model/pbx/DisagreementsCountersRealtimeLogModel');
var userPbxModel = require(path + '/model/pbx/UserPbxModel');
var clientPbxModel = require(path + '/model/pbx/client/ClientPbxModel');
const SupervisorClientPbxModel = require(path + '/model/pbx/client/SupervisorClientPbxModel');
const ApplicationBL = require(path + '/business/app/ApplicationBL');
var socketPbxBL = require(path + '/business/pbx/SocketPbxBL');
const dateFormat = require("dateformat");

/**
 * Contrutora da classe de RealtimeReportPbxBL
 * @constructor
 */
function RealTimeReportPbxBL() {
    local = this;
}

RealTimeReportPbxBL.prototype.GetRealtTimeData = GetRealtTimeData;
RealTimeReportPbxBL.prototype.GetRealtimeSnapshotData = GetRealtimeSnapshotData;
RealTimeReportPbxBL.prototype.createTicketSupport = createTicketSupport;
RealTimeReportPbxBL.prototype.createDisagreementsCounters = createDisagreementsCounters;

RealTimeReportPbxBL.prototype.GetRealtTimeSocket = GetRealtTimeSocket;
module.exports = RealTimeReportPbxBL;

/**
 * Obtém dados do pbx em tempo real
 * @param $client
 * @returns {Promise|*}
 * @constructor
 */
function GetRealtTimeData($client) {

    //promise list
    return promise.try(promiseGetReportRealtime)
      .catch(promiseError);

    async function promiseGetReportRealtime() {
        global.$log.info('Processando busca inicial no banco para o usuario: ' + $client.user_id);
        const user = await userPbxModel.findById($client.user_id, {'super': 1}).lean();
        if (user) {
            let queueQuery = {"client_id": $client.client_id};
            let agentQuery = {"client_id": $client.client_id};

            if ($client.queue_id && $client.queue_id !== "undefined" && $client.queue_id !== "all_queue") {
                queueQuery.queue_id = {$in: $client.queue_id.split(";")};
                agentQuery.$and = [{
                    $or: [{registered_queues: {$in: $client.queue_id.split(";")}}, {'queues.queue_id': {$in: $client.queue_id.split(";")}},]
                }];
            }
            global.$log.info('Processando busca inicial no banco para o usuario: ' + $client.user_id + ' usuario encontrato');
            if (user.super) {
                global.$log.info('Processando busca inicial no banco para o usuario: ' + $client.user_id + " usuario super: true");
                let IVR = await RealtimeIVRReportPbxModel.findOne({'client_id': $client.client_id}).lean();
                let queues = await RealtimeQueueReportPbxModel.find(queueQuery).lean();
                let agents = await RealtimeAgentReportPbxModel.find(agentQuery).lean();

                for (let i in queues) {
                    queues[i].enable_queue = true;
                }

                if (!IVR) return null;
                IVR.queues = queues;
                IVR.agents = agents;
                return IVR;
            } else {
                global.$log.info('Processando busca inicial no banco para o usuario: ' + $client.user_id + " buscando o tipo de usuario no client: " + $client.client_id);
                const client = await clientPbxModel.findOne({
                    _id: mongoose.Types.ObjectId($client.client_id), "pbx.user.user_id": $client.user_id
                }, {"pbx.user.$": 1}).lean();

                const user_client = client.pbx.user[0];
                const supervisor_group = await SupervisorClientPbxModel.findOne({
                    client_id: mongoose.Types.ObjectId('' + client._id),
                    user_id: mongoose.Types.ObjectId(user_client.user_id),
                }).lean();
                const userSettings = await UserSettingsRealtimePbxModel.findOne({ user_id: $client.user_id, client_id: $client.client_id }, {'settings.queues': 1}).lean()
                const queuesIdsUser = userSettings.settings.queues.reduce((acc, cur) => {
                    acc[cur.queue_id] = {enable_queue: cur.enable_queue}
                    return acc;
                }, {})

                if (+user_client.permission === 10) {
                    global.$log.info('Processando busca inicial no banco para o usuario: ' + $client.user_id + " usuario tipo admin no client: " + $client.client_id);
                    const IVR = await RealtimeIVRReportPbxModel.findOne({'client_id': $client.client_id}).lean();
                    const queues = await RealtimeQueueReportPbxModel.find(queueQuery).lean();
                    const agents = await RealtimeAgentReportPbxModel.find(agentQuery).lean();

                    for (let queue of queues) {
                        if (queuesIdsUser[queue.queue_id]) queue.enable_queue = queuesIdsUser[queue.queue_id].enable_queue || false;
                    }

                    if (!IVR) return null;
                    IVR.queues = queues;
                    IVR.agents = agents;
                    return IVR;
                } else if (+user_client.permission === 5) {
                    let agent_query = [];
                    let queue_query = [];

                    const group_queues_map = supervisor_group.queues.reduce((map, queue) => {
                        map[queue.queue_id] = {view_abandoned: queue.view_abandoned};
                        map.size++;

                        if ($client.queue_id && $client.queue_id !== "undefined" && $client.queue_id !== "all_queue" && $client.queue_id.includes(queue.queue_id)) queue_query.push(queue.queue_id); else if ($client.queue_id === "undefined" || $client.queue_id === "all_queue") queue_query.push(queue.queue_id);

                        return map;
                    }, {size: 0});

                    const group_agents_map = supervisor_group.agents.reduce((map, e) => {
                        agent_query.push(e.branch_number);

                        map[e.branch_number] = true;
                        map.size++;
                        return map;
                    }, {size: 0});

                    global.$log.info('Processando busca inicial no banco para o usuario: ' + $client.user_id + " usuario tipo supervisor no client: " + $client.client_id);
                    let IVR = await RealtimeIVRReportPbxModel.findOne({'client_id': $client.client_id}).lean();

                    let queues = await RealtimeQueueReportPbxModel.find({
                        ...queueQuery, queue_id: {$in: queue_query}
                    }).lean();

                    let agents = await RealtimeAgentReportPbxModel.find({
                        ...agentQuery, branch_number: {$in: agent_query}
                    }).lean();

                    queues = queues.map(queue => {
                        const viewAbandoned = group_queues_map[queue.queue_id].view_abandoned;
                        const filteredCallsWaiting = queue.calls.waiting.filter(call => (!call.branch_number && viewAbandoned) || group_agents_map[call.branch_number]);
                        const filteredCallsAttendance = queue.calls.attendance.filter(call => (!call.branch_number && viewAbandoned) || group_agents_map[call.branch_number]);

                        if (queuesIdsUser[queue.queue_id]) queue.enable_queue = queuesIdsUser[queue.queue_id].enable_queue || false;

                        return {
                            ...queue, calls: {
                                attendance: filteredCallsAttendance, waiting: filteredCallsWaiting
                            }
                        }
                    })

                    if (!IVR) return null;
                    IVR.queues = queues;
                    IVR.agents = agents;
                    return IVR;
                }
            }
        }
        return null;
    }

    //tratamento de erro
    function promiseError(ex) {
        global.$log.error('Processing error in the module: ' + __filename.split(/[\\/]/).pop(), ex);
        throw ex;
    }
}

function GetRealtimeSnapshotData($client_id, sinceInHours) {

    //promise list
    return promise.try(promiseGetReportForClient)
        .then(promiseRegisterRealtimeEvent)
        .catch(promiseError);

    async function promiseGetReportForClient() {

        let dt = new Date();
        dt.setTime(dt.getTime() - (sinceInHours * 60 * 60 * 1000));

        try {
            const queryCursor = RealtimeSnapshotPbxModel.find({ client_id: $client_id }, { 'snapshots.queues': 0 }, { allowDiskUse: true, maxTimeMS: 15000 } ).cursor()

            let snaphostFilter = []

            if (queryCursor){
                for await (const cursor of queryCursor){

                    const document = cursor._doc;
                    snaphostFilter = document.snapshots.filter((snap) => snap.createdAt >= dt);
                }
            }

            return { snapshots: snaphostFilter }
        } catch(err) {
            if (err.message.includes('operation exceeded time limit')) return new Error("Mongo aggregation pipeline timed out")
            throw err;
        }
    }

    function promiseRegisterRealtimeEvent(result_get_event) {
        return result_get_event;
    }

    //tratamento de erro
    function promiseError(ex) {
        global.$log.error('Processing error in the module: ' + __filename.split(/[\\/]/).pop(), ex);
        throw ex;
    }
}

/**
 * Obtém dados do pbx em tempo real (simulação filtro de fila)
 * @param $client
 * @returns {Promise|*}
 * @constructor
 */
function GetRealtTimeSocket($client) {

    //promise list
    return promise.try(promiseGetReportForClient)
        .then(promiseRegisterRealtimeEvent)
        .then(promiseGetEventSoket)
        .catch(promiseError);

    //TODO -- Inserir políticas de grupos de usuários
    function promiseGetReportForClient() {
        return RealtimeIVRReportPbxModel.findOne({'client_id': $client.client_id}).lean()
    }

    async function promiseRegisterRealtimeEvent(result_get_event) {
        let queues = await RealtimeQueueReportPbxModel.find({"client_id": $client.client_id}).lean();
        let agents = await RealtimeAgentReportPbxModel.find({"client_id": $client.client_id}).lean();

        result_get_event.queues = queues;
        result_get_event.agents = agents;
        return result_get_event;
    }

    function promiseGetEventSoket(result_report) {
        var socket_pbx_bl = new socketPbxBL();
        socket_pbx_bl.ReportRealtimeEvent($client.client_id, result_report);
        return null;
    }

    //tratamento de erro
    function promiseError(ex) {
        global.$log.error('Processing error in the module: ' + __filename.split(/[\\/]/).pop(), ex);
        throw ex;
    }
}


async function createTicketSupport($ticket, $client_id, $token, $application) {
    const headers = {
        'Content-Type': 'application/json',
        integration: global.ticket.integration_id,
        Authorization: `${$token}`,
    };

    const clientSipServer = await clientPbxModel.findById($client_id, {"sip_server": 1}).lean();
    const hosts = $application.settings.sip.find((hosts) => hosts.sip_server === clientSipServer.sip_server);

    const NOT_FOUND_PLACEHOLDER = "Informação não disponível"
    const descriptionHTML = `
        <h1>
            <span style='color: #0a6c50;'>REPORT AUTOMÁTICO CLIENTES</span>
            <span style='color: #e6b900;'>55PBX</span> REALTIME:
        </h1>
        <div>
            <table>
                <tr>
                    <td>REPORT_AUTO_CLIENTE_NOME_FILA</td>
                    <td>${$ticket.queue_name || NOT_FOUND_PLACEHOLDER}</td>
                </tr>
                <tr>
                    <td>REPORT_AUTO_CLIENTE_POSSUI_SOCKET</td>
                    <td>${$ticket.is_socket_on || NOT_FOUND_PLACEHOLDER}</td>
                </tr>
                <tr>
                    <td>REPORT_AUTO_CLIENTE_CENTRAL_ID</td>
                    <td>${$ticket.client_central_id || NOT_FOUND_PLACEHOLDER}</td>
                </tr>
                <tr>
                    <td>REPORT_AUTO_CLIENTE_RAMAL_NOME</td>
                    <td>${$ticket.branch_name || NOT_FOUND_PLACEHOLDER}</td>
                </tr>
                <tr>
                    <td>REPORT_AUTO_CLIENTE_MOTIVO</td>
                    <td>${$ticket.reason || NOT_FOUND_PLACEHOLDER}</td>
                </tr>
                <tr>
                    <td>REPORT_AUTO_CLIENTE_IDCONTA</td>
                    <td>${$ticket.client_id || NOT_FOUND_PLACEHOLDER}</td>
                </tr>
                <tr>
                    <td>REPORT_AUTO_CLIENTE_NOME_CONTA</td>
                    <td>${$ticket.account_name || NOT_FOUND_PLACEHOLDER}</td>
                </tr>
                <tr>
                    <td>REPORT_AUTO_CLIENTE_CATEGORIA</td>
                    <td>${$ticket.category || NOT_FOUND_PLACEHOLDER}</td>
                </tr>
                ${$ticket.category !== "Ramais" ? `<tr>
                    <td>REPORT_AUTO_CLIENTE_SUBCATEGORIA</td>
                    <td>${$ticket.subcategory || NOT_FOUND_PLACEHOLDER}</td>
                </tr>` : ''}
                <tr>
                    <td>REPORT_AUTO_CLIENTE_TELEFONE_CONTATO</td>
                    <td>${$ticket.number_contact || NOT_FOUND_PLACEHOLDER}</td>
                </tr>
                <tr>
                    <td>REPORT_AUTO_CLIENTE_EMAIL_CONTATO</td>
                    <td>${$ticket.email_contact || NOT_FOUND_PLACEHOLDER}</td>
                </tr>
            </table>
        </div>
    `

    const data = {
        "subject":"REPORT AUTOMÁTICO CLIENTES",
        "description": descriptionHTML,
        "source": 3,
        "priority": 4,
        "status": 2,
        "type": "Incident",
        "phone": $ticket.number_contact,
    }

    // save log database
    try {
        const modelReportInconsistency = new ReportInconsistencyRealtimePbxModel()
        modelReportInconsistency.information_reporter = {
            client_id: $ticket.client_id,
            central_id: $ticket.client_central_id,
            branch_name: $ticket.branch_name,
            account_name: $ticket.account_name,
            number_contact: $ticket.number_contact,
            email_contact: $ticket.email_contact,
            queue_id: $ticket.queue_id,
            is_connect_socket: $ticket.is_socket_on === "Sim",
        }

        let information_database = {}
        if ($ticket.category === 'Ramais' && $ticket.collect) {
            information_database = await RealtimeAgentReportPbxModel.find({
                _id: {$in: $ticket.collect.map((branch) => mongoose.Types.ObjectId(branch._id))}
            }).lean()
        } else {
            let query = { queue_id: $ticket.queue_id }
            if ($ticket.queue_id === 'all_queue') {
                query = { client_id: $ticket.client_id }
            }
            information_database = await RealtimeQueueReportPbxModel.find(query).lean()
        }

        modelReportInconsistency.data_inconsistency = {
            reason_inconsistency: $ticket.reason,
            category_inconsistency: $ticket.category,
            subcategory_inconsistency: $ticket.subcategory || '',
            collect_inconsistency_sent_by_user: $ticket.collect,
            information_database: information_database
        }

        await modelReportInconsistency.save()
    } catch (err) {
        global.$log.info(`Erro para salvar inconsistências: -> ex: "${err}"`);
    }

    global.$log.info(`Reportar inconsistências - routa integrador ${JSON.stringify(data)} | headers ${JSON.stringify(headers)} | url ${hosts.integration_base + '/incidents'}`)
    return axios({
        method: 'post',
        url: hosts.integration_base + '/incidents',
        data,
        responseType: 'json',
        headers: headers,
    });
}

async function createDisagreementsCounters($listDisagreements) {
    for (const model of $listDisagreements) {
        if (model.disagreements.calls.attendance) model.disagreements.calls.attendance.forEach((call) => delete call['$$hashKey']);
        if (model.disagreements.calls.waiting) model.disagreements.calls.waiting.forEach((call) => delete call['$$hashKey']);
    }

    await DisagreementsCountersRealtimeLogModel.insertMany($listDisagreements)
    return true;
}
