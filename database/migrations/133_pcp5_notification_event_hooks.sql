BEGIN;

CREATE OR REPLACE FUNCTION pcp5_publish_notification_for_email(
  recipient_email TEXT,
  notification_type_value TEXT,
  category_value TEXT,
  title_value TEXT,
  message_value TEXT,
  priority_value TEXT,
  entity_type_value TEXT,
  entity_id_value TEXT,
  action_url_value TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  target_user users%ROWTYPE;
  new_notification_id UUID;
BEGIN
  SELECT * INTO target_user
  FROM users
  WHERE lower(email) = lower(recipient_email) AND status = 'ACTIVE'
  ORDER BY created_at ASC
  LIMIT 1;

  IF target_user.user_id IS NULL THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM notification_preferences
    WHERE institution_key = target_user.institution_key
      AND user_id = target_user.user_id
      AND category = category_value
      AND in_app_enabled = FALSE
  ) THEN RETURN; END IF;

  new_notification_id := gen_random_uuid();
  INSERT INTO notifications (
    notification_id, institution_key, recipient_user_id, notification_type,
    category, title, message, priority, status, related_entity_type,
    related_entity_id, action_url, metadata
  ) VALUES (
    new_notification_id, target_user.institution_key, target_user.user_id,
    notification_type_value, category_value, title_value, message_value,
    priority_value, 'UNREAD', entity_type_value, entity_id_value,
    action_url_value, '{}'::jsonb
  );

  INSERT INTO notification_delivery_attempts (
    notification_delivery_attempt_id, institution_key, notification_id,
    channel, status, delivered_at, metadata
  ) VALUES (
    gen_random_uuid(), target_user.institution_key, new_notification_id,
    'IN_APP', 'DELIVERED', NOW(), '{}'::jsonb
  );

  INSERT INTO notification_events (
    notification_event_id, institution_key, notification_id, user_id,
    event_type, resulting_status, event_data
  ) VALUES (
    gen_random_uuid(), target_user.institution_key, new_notification_id,
    target_user.user_id, 'CREATED', 'UNREAD', '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION pcp5_job_application_notifications()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE worker_email TEXT; employer_email TEXT; job_title TEXT;
BEGIN
  SELECT cp.email, ep.business_email, ej.title
  INTO worker_email, employer_email, job_title
  FROM career_profiles cp
  JOIN employer_jobs ej ON ej.job_id = NEW.job_id
  JOIN employer_profiles ep ON ep.employer_id = ej.employer_id
  WHERE cp.career_profile_id = NEW.career_profile_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM pcp5_publish_notification_for_email(worker_email, 'APPLICATION_SUBMITTED', 'APPLICATIONS',
      'Application submitted', 'Your application for ' || job_title || ' was submitted.', 'NORMAL',
      'JOB_APPLICATION', NEW.application_id::text, '/platform/employment/employee');
    PERFORM pcp5_publish_notification_for_email(employer_email, 'APPLICATION_RECEIVED', 'APPLICATIONS',
      'New application received', 'A candidate applied for ' || job_title || '.', 'HIGH',
      'JOB_APPLICATION', NEW.application_id::text, '/platform/employment/employer');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM pcp5_publish_notification_for_email(worker_email, 'APPLICATION_STATUS_CHANGED', 'APPLICATIONS',
      'Application status updated', job_title || ' is now ' || replace(NEW.status, '_', ' ') || '.',
      CASE WHEN NEW.status IN ('OFFERED','REJECTED') THEN 'HIGH' ELSE 'NORMAL' END,
      'JOB_APPLICATION', NEW.application_id::text, '/platform/employment/employee');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcp5_job_application_notify ON job_applications;
CREATE TRIGGER pcp5_job_application_notify AFTER INSERT OR UPDATE OF status ON job_applications
FOR EACH ROW EXECUTE FUNCTION pcp5_job_application_notifications();

CREATE OR REPLACE FUNCTION pcp5_interview_notifications()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE worker_email TEXT; employer_email TEXT; job_title TEXT;
BEGIN
  SELECT cp.email, ep.business_email, ej.title
  INTO worker_email, employer_email, job_title
  FROM job_applications ja
  JOIN career_profiles cp ON cp.career_profile_id = ja.career_profile_id
  JOIN employer_jobs ej ON ej.job_id = ja.job_id
  JOIN employer_profiles ep ON ep.employer_id = ej.employer_id
  WHERE ja.application_id = NEW.application_id;

  PERFORM pcp5_publish_notification_for_email(worker_email,
    CASE WHEN TG_OP='INSERT' THEN 'INTERVIEW_SCHEDULED' WHEN NEW.status='CANCELLED' THEN 'INTERVIEW_CANCELLED' ELSE 'INTERVIEW_UPDATED' END,
    'INTERVIEWS',
    CASE WHEN TG_OP='INSERT' THEN 'Interview scheduled' WHEN NEW.status='CANCELLED' THEN 'Interview cancelled' ELSE 'Interview updated' END,
    job_title || ' interview: ' || NEW.status || ' for ' || to_char(NEW.scheduled_at, 'Mon DD, YYYY HH12:MI AM') || '.',
    'HIGH', 'APPLICATION_INTERVIEW', NEW.interview_id::text, '/platform/employment/employee');
  PERFORM pcp5_publish_notification_for_email(employer_email, 'INTERVIEW_RESPONSE', 'INTERVIEWS',
    'Interview record updated', job_title || ' interview is ' || NEW.status || '.', 'NORMAL',
    'APPLICATION_INTERVIEW', NEW.interview_id::text, '/platform/employment/employer');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcp5_interview_notify ON application_interviews;
CREATE TRIGGER pcp5_interview_notify AFTER INSERT OR UPDATE OF status, scheduled_at ON application_interviews
FOR EACH ROW EXECUTE FUNCTION pcp5_interview_notifications();

CREATE OR REPLACE FUNCTION pcp5_payroll_event_notifications()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE worker_email TEXT; employer_email TEXT;
BEGIN
  SELECT cp.email, ep.business_email INTO worker_email, employer_email
  FROM payroll_workers pw
  JOIN career_profiles cp ON cp.career_profile_id = pw.career_profile_id
  JOIN employer_profiles ep ON ep.employer_id = pw.employer_id
  WHERE pw.payroll_worker_id = NEW.payroll_worker_id;

  IF worker_email IS NOT NULL THEN
    PERFORM pcp5_publish_notification_for_email(worker_email, 'PAYROLL_' || NEW.event_type, 'PAYROLL',
      NEW.title, COALESCE(NEW.detail, NEW.title),
      CASE WHEN NEW.event_type IN ('PAID','CORRECTION_OPENED') THEN 'HIGH' ELSE 'NORMAL' END,
      'PAYROLL_RECORD', NEW.payroll_record_id::text, '/platform/employment/employee');
  END IF;
  IF employer_email IS NOT NULL THEN
    PERFORM pcp5_publish_notification_for_email(employer_email, 'PAYROLL_' || NEW.event_type, 'PAYROLL',
      NEW.title, COALESCE(NEW.detail, NEW.title), 'NORMAL',
      'PAYROLL_RECORD', NEW.payroll_record_id::text, '/platform/employment/employer');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcp5_payroll_event_notify ON payroll_events;
CREATE TRIGGER pcp5_payroll_event_notify AFTER INSERT ON payroll_events
FOR EACH ROW EXECUTE FUNCTION pcp5_payroll_event_notifications();

CREATE OR REPLACE FUNCTION pcp5_disbursement_notifications()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE employer_email TEXT;
BEGIN
  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT business_email INTO employer_email FROM employer_profiles WHERE employer_id=NEW.employer_id;
    PERFORM pcp5_publish_notification_for_email(employer_email, 'DISBURSEMENT_' || NEW.status, 'DISBURSEMENTS',
      'Disbursement ' || lower(NEW.status), 'Disbursement of $' || to_char(NEW.amount, 'FM9999999990.00') || ' is ' || lower(NEW.status) || '.',
      CASE WHEN NEW.status='FAILED' THEN 'CRITICAL' WHEN NEW.status='COMPLETED' THEN 'HIGH' ELSE 'NORMAL' END,
      'EMPLOYER_DISBURSEMENT', NEW.disbursement_id::text, '/platform/employment/employer');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcp5_disbursement_notify ON employer_disbursements;
CREATE TRIGGER pcp5_disbursement_notify AFTER INSERT OR UPDATE OF status ON employer_disbursements
FOR EACH ROW EXECUTE FUNCTION pcp5_disbursement_notifications();

CREATE OR REPLACE FUNCTION pcp5_funding_notifications()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE employer_email TEXT;
BEGIN
  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT business_email INTO employer_email FROM employer_profiles WHERE employer_id=NEW.employer_id;
    PERFORM pcp5_publish_notification_for_email(employer_email, 'FUNDING_' || NEW.status, 'FUNDING',
      'Funding source ' || lower(NEW.status), NEW.display_name || ' is ' || lower(NEW.status) || '.',
      CASE WHEN NEW.status='VERIFIED' THEN 'HIGH' ELSE 'NORMAL' END,
      'EMPLOYER_FUNDING_SOURCE', NEW.funding_source_id::text, '/platform/employment/employer');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcp5_funding_notify ON employer_funding_sources;
CREATE TRIGGER pcp5_funding_notify AFTER INSERT OR UPDATE OF status ON employer_funding_sources
FOR EACH ROW EXECUTE FUNCTION pcp5_funding_notifications();

CREATE OR REPLACE FUNCTION pcp5_document_notifications()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE worker_email TEXT; employer_email TEXT; doc_title TEXT;
BEGIN
  SELECT cp.email, ep.business_email, wd.title INTO worker_email, employer_email, doc_title
  FROM worker_documents wd
  JOIN career_profiles cp ON cp.career_profile_id=wd.career_profile_id
  LEFT JOIN employer_profiles ep ON ep.employer_id=wd.employer_id
  WHERE wd.worker_document_id=NEW.worker_document_id;

  PERFORM pcp5_publish_notification_for_email(worker_email, 'DOCUMENT_' || NEW.event_type, 'DOCUMENTS',
    'Document ' || lower(NEW.event_type), doc_title || ' was ' || lower(NEW.event_type) || '.', 'NORMAL',
    'WORKER_DOCUMENT', NEW.worker_document_id::text, '/platform/employment/employee');
  IF employer_email IS NOT NULL AND NEW.event_type IN ('UPLOADED','REPLACED') THEN
    PERFORM pcp5_publish_notification_for_email(employer_email, 'WORKER_DOCUMENT_' || NEW.event_type, 'DOCUMENTS',
      'Worker document received', doc_title || ' was ' || lower(NEW.event_type) || '.', 'HIGH',
      'WORKER_DOCUMENT', NEW.worker_document_id::text, '/platform/employment/employer');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcp5_document_notify ON worker_document_events;
CREATE TRIGGER pcp5_document_notify AFTER INSERT ON worker_document_events
FOR EACH ROW EXECUTE FUNCTION pcp5_document_notifications();

CREATE OR REPLACE FUNCTION pcp5_support_notifications()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE worker_email TEXT;
BEGIN
  SELECT email INTO worker_email FROM career_profiles WHERE career_profile_id=NEW.career_profile_id;
  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM pcp5_publish_notification_for_email(worker_email, 'SUPPORT_' || NEW.status, 'SUPPORT',
      'Support case ' || lower(NEW.status), NEW.subject || ' is ' || lower(NEW.status) || '.',
      CASE WHEN NEW.status='RESOLVED' THEN 'HIGH' ELSE 'NORMAL' END,
      'WORKER_SUPPORT_CASE', NEW.support_case_id::text, '/platform/employment/employee');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcp5_support_notify ON worker_support_cases;
CREATE TRIGGER pcp5_support_notify AFTER INSERT OR UPDATE OF status ON worker_support_cases
FOR EACH ROW EXECUTE FUNCTION pcp5_support_notifications();

COMMIT;
