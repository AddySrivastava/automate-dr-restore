// TODO - Use these as environment variable in production
const privateKey = <private-key>;
const publicKey = <public-key>;

const urllib = require('urllib');

/*
API RESOURCE = https://www.mongodb.com/docs/atlas/reference/api/clusters-get-one/
*/
async function getClusterDetailsWithName(projectId, clusterName) {
    const GET_CLUSTER_ENDPOINT = `groups/${projectId}/clusters/${clusterName}`;

    if (!projectId || !clusterName) throw new Error('projectId or clustername cannot be empty');

    try {
        let { data } = await fetch(GET_CLUSTER_ENDPOINT);
        return data;
    } catch (err) {
        console.error(err);
    }
}

/*
API RESOURCE = https://www.mongodb.com/docs/atlas/reference/api/clusters-create-one/
*/
async function createNewClusterFromExistingCluster(projectId, existingClusterName, region) {

    const CREATE_CLUSTER_ENDPOINT = `groups/${projectId}/clusters`;

    if (!projectId || !existingClusterName || !region) throw new Error('projectId or clustername cannot be empty');

    // fetch cluster details and configuration from prod cluster

    try {
        let {
            clusterType,
            diskSizeGB,
            mongoDBVersion,
            mongoDBMajorVersion,
            name,
            providerSettings
        } = await getClusterDetailsWithName(projectId, existingClusterName);

        // add new region
        providerSettings.regionName = region;

        // disable auto scaling in DR cluster
        delete providerSettings['autoScaling'];

        let body = {
            clusterType,
            diskSizeGB,
            mongoDBVersion,
            mongoDBMajorVersion,
            name: `${name}-DR`,
            providerSettings,
            backupEnabled: false

        }
        let { response: { data } } = await post(CREATE_CLUSTER_ENDPOINT, body);

        return data.name;
    } catch (err) {
        console.log(err);
    }
}



async function fetch(endpoint) {

    if (!endpoint) throw new Error('ENDPOINT CANNOT BE EMPTY');

    let getEndpoint = `https://cloud.mongodb.com/api/atlas/v1.0/${endpoint}`

    let options = {
        digestAuth: `${publicKey}:${privateKey}`,
        method: 'GET',
        headers: {
            'content-type': 'application/json'
        },
        dataType: 'json'
    };
    return await urllib.request(getEndpoint, options);

}

async function post(endpoint, body) {
    let postEndpoint = `https://cloud.mongodb.com/api/atlas/v1.0/${endpoint}`;

    let options = {
        digestAuth: `${publicKey}:${privateKey}`,
        method: 'POST',
        dataType: 'json',
        headers: {
            'content-type': 'application/json'
        },
        data: body
    };

    return await urllib.request(postEndpoint, options);
}

/*
API RESOURCE = https://www.mongodb.com/docs/atlas/reference/api/cloud-backup/restore/create-one-restore-job/
*/
async function restoreProdBackupToDR(sourceClusterProjectId, targetClusterProjectId, existingClusterName, drClusterName) {

    const restoreBackupEndpoint = `groups/${sourceClusterProjectId}/clusters/${existingClusterName}/backup/restoreJobs/`

    if (!drClusterName.includes('-DR')) throw new Error('THE DR CLUSTER DOESNOT CONTAIN DR NAME');

    if (!existingClusterName || !drClusterName) throw new Error('EXISTING OR DR CLUSTER NAME CANNOT BE EMPTY');

    // get latest snapshotId by createdDate 
    let snapshotId = await getLatestSnapshotId(sourceClusterProjectId, existingClusterName);

    // prepare body to restore the data

    let body = {
        deliveryType: 'automated',
        snapshotId,
        targetClusterName: drClusterName,
        targetGroupId: targetClusterProjectId
    }
    try {
        let response = await post(restoreBackupEndpoint, body);

        return response;

    } catch (err) {
        console.error(response);
    }
}

/*
API RESOURCE = https://www.mongodb.com/docs/atlas/reference/api/cloud-backup/backup/get-all-backups/
*/
async function getLatestSnapshotId(projectId, clusterName) {

    const cloudBackupEndpoint = `groups/${projectId}/clusters/${clusterName}/backup/snapshots`;

    if (!projectId || !clusterName) throw new Error('projectId or clustername cannot be empty');

    let { data: { results } } = await fetch(cloudBackupEndpoint);

    // sort by createdDate in descending order and return the first element
    results.sort((a, b) => b.createdAt - a.createdAt);

    return results[0].id;

}

/*
Timeout helper
*/
function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function prepareClusterForQuarterlyDRTest() {
    let existingClusterName = 'adityas-m10';
    let newClusterRegion = 'US_EAST_1';
    let sourceClusterProjectId = '60d30661b1bb5c387b08f499';
    let targetClusterProjectId = '5f3b9916670fcb036112c47f'

    try {
        //create New cluster with -DR appended
        let newClusterName = await createNewClusterFromExistingCluster(sourceClusterProjectId, targetClusterProjectId, existingClusterName, newClusterRegion);

        //wait for 12 minutes for cluster creation
        await timeout(60000 * 12);

        let response = await restoreProdBackupToDR(sourceClusterProjectId, targetClusterProjectId, existingClusterName, newClusterName);
        console.log(response);
    } catch (err) {
        console.error(err);
    }
}

/*
ENTRY POINT
*/
prepareClusterForQuarterlyDRTest();
