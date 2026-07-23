import { randomUUID } from "crypto";
import { query } from "@/lib/db";

const INSTITUTION_KEY = "SAIN_FINANCE";

export async function getPlatformOperationsWorkspace(search = "") {
  const q = `%${search.trim()}%`;
  const [services,deployments,incidents,maintenance,summary] = await Promise.all([
    query(`SELECT * FROM platform_services WHERE institution_key = $1 AND ($2 = '%%' OR service_name ILIKE $2 OR service_code ILIKE $2) ORDER BY service_name`,[INSTITUTION_KEY,q]),
    query(`SELECT d.*,s.service_name,s.service_code FROM platform_deployments d JOIN platform_services s ON s.platform_service_id=d.platform_service_id WHERE d.institution_key=$1 ORDER BY d.created_at DESC LIMIT 100`,[INSTITUTION_KEY]),
    query(`SELECT i.*,s.service_name FROM platform_incidents i LEFT JOIN platform_services s ON s.platform_service_id=i.platform_service_id WHERE i.institution_key=$1 ORDER BY i.detected_at DESC LIMIT 100`,[INSTITUTION_KEY]),
    query(`SELECT m.*,s.service_name FROM platform_maintenance_windows m LEFT JOIN platform_services s ON s.platform_service_id=m.platform_service_id WHERE m.institution_key=$1 ORDER BY m.starts_at DESC LIMIT 100`,[INSTITUTION_KEY]),
    query(`SELECT
      COUNT(*) FILTER (WHERE status='OPERATIONAL')::int AS operational_services,
      COUNT(*) FILTER (WHERE status IN ('DEGRADED','OUTAGE'))::int AS impaired_services,
      (SELECT COUNT(*)::int FROM platform_deployments WHERE institution_key=$1 AND status IN ('PENDING','RUNNING')) AS active_deployments,
      (SELECT COUNT(*)::int FROM platform_incidents WHERE institution_key=$1 AND status NOT IN ('RESOLVED','CLOSED')) AS open_incidents,
      (SELECT COUNT(*)::int FROM platform_maintenance_windows WHERE institution_key=$1 AND status='SCHEDULED' AND starts_at >= NOW()) AS upcoming_maintenance
      FROM platform_services WHERE institution_key=$1`,[INSTITUTION_KEY]),
  ]);
  return { services: services.rows, deployments: deployments.rows, incidents: incidents.rows, maintenance: maintenance.rows, summary: summary.rows[0] };
}

async function event(entityType:string,entityId:string,eventType:string,eventData:Record<string,unknown>,actor:string) {
  await query(`INSERT INTO platform_operation_events(platform_operation_event_id,institution_key,entity_type,entity_id,event_type,event_data,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),INSTITUTION_KEY,entityType,entityId,eventType,eventData,actor]);
}

export async function createPlatformService(input:any, actor="operator") {
  const id=randomUUID();
  await query(`INSERT INTO platform_services(platform_service_id,institution_key,service_code,service_name,service_type,environment,status,health_endpoint,owner_team,description,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,'OPERATIONAL',$7,$8,$9,$10,$10)`,[id,INSTITUTION_KEY,input.serviceCode,input.serviceName,input.serviceType,input.environment||'PRODUCTION',input.healthEndpoint||null,input.ownerTeam||null,input.description||null,actor]);
  await event('SERVICE',id,'SERVICE_CREATED',input,actor);
  return { platformServiceId:id };
}

export async function createDeployment(input:any, actor="operator") {
  const id=randomUUID();
  await query(`INSERT INTO platform_deployments(platform_deployment_id,institution_key,platform_service_id,version,commit_sha,environment,status,initiated_by,metadata) VALUES($1,$2,$3,$4,$5,$6,'PENDING',$7,$8)`,[id,INSTITUTION_KEY,input.platformServiceId,input.version,input.commitSha||null,input.environment||'PRODUCTION',actor,input.metadata||{}]);
  await event('DEPLOYMENT',id,'DEPLOYMENT_CREATED',input,actor);
  return { platformDeploymentId:id };
}

export async function createIncident(input:any, actor="operator") {
  const id=randomUUID();
  await query(`INSERT INTO platform_incidents(platform_incident_id,institution_key,platform_service_id,incident_code,title,severity,status,summary,commander_user_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,'OPEN',$7,$8,$9,$9)`,[id,INSTITUTION_KEY,input.platformServiceId||null,input.incidentCode,input.title,input.severity,input.summary||null,input.commanderUserId||null,actor]);
  await event('INCIDENT',id,'INCIDENT_CREATED',input,actor);
  return { platformIncidentId:id };
}

export async function createMaintenance(input:any, actor="operator") {
  const id=randomUUID();
  await query(`INSERT INTO platform_maintenance_windows(platform_maintenance_window_id,institution_key,platform_service_id,maintenance_name,starts_at,ends_at,status,impact_level,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,'SCHEDULED',$7,$8,$9,$9)`,[id,INSTITUTION_KEY,input.platformServiceId||null,input.maintenanceName,input.startsAt,input.endsAt,input.impactLevel||'LOW',input.notes||null,actor]);
  await event('MAINTENANCE',id,'MAINTENANCE_CREATED',input,actor);
  return { platformMaintenanceWindowId:id };
}

export async function updatePlatformOperation(itemType:string,itemId:string,action:string,actor="operator") {
  const now=new Date().toISOString();
  if(itemType==='SERVICE') {
    const status=action==='RESTORE'?'OPERATIONAL':action==='DEGRADE'?'DEGRADED':action==='OUTAGE'?'OUTAGE':null;
    if(!status) throw new Error('INVALID_ACTION');
    await query(`UPDATE platform_services SET status=$1,updated_by=$2,updated_at=NOW() WHERE institution_key=$3 AND platform_service_id=$4`,[status,actor,INSTITUTION_KEY,itemId]);
  } else if(itemType==='DEPLOYMENT') {
    const map:any={START:['RUNNING','started_at'],SUCCEED:['SUCCEEDED','completed_at'],FAIL:['FAILED','completed_at'],ROLLBACK:['ROLLED_BACK','completed_at']};
    const target=map[action]; if(!target) throw new Error('INVALID_ACTION');
    await query(`UPDATE platform_deployments SET status=$1,${target[1]}=$2,updated_at=NOW() WHERE institution_key=$3 AND platform_deployment_id=$4`,[target[0],now,INSTITUTION_KEY,itemId]);
  } else if(itemType==='INCIDENT') {
    const map:any={ACKNOWLEDGE:['ACKNOWLEDGED','acknowledged_at'],RESOLVE:['RESOLVED','resolved_at'],CLOSE:['CLOSED','resolved_at']};
    const target=map[action]; if(!target) throw new Error('INVALID_ACTION');
    await query(`UPDATE platform_incidents SET status=$1,${target[1]}=$2,updated_by=$3,updated_at=NOW() WHERE institution_key=$4 AND platform_incident_id=$5`,[target[0],now,actor,INSTITUTION_KEY,itemId]);
  } else if(itemType==='MAINTENANCE') {
    const status=action==='START'?'IN_PROGRESS':action==='COMPLETE'?'COMPLETE':action==='CANCEL'?'CANCELLED':null;
    if(!status) throw new Error('INVALID_ACTION');
    await query(`UPDATE platform_maintenance_windows SET status=$1,updated_by=$2,updated_at=NOW() WHERE institution_key=$3 AND platform_maintenance_window_id=$4`,[status,actor,INSTITUTION_KEY,itemId]);
  } else throw new Error('INVALID_ITEM_TYPE');
  await event(itemType,itemId,action,{},actor);
  return { ok:true };
}
