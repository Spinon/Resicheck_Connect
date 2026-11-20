import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compileExactImageScope} from './compile-exact-inspector-scope.mjs';

// Local candidate only. Reuses the existing definer and invoker wrapper/ACLs.
// NULL attachment means trusted service dequeue; users never issue a scope.
export async function compileNormalImageQueue() {
 const c=await compileExactImageScope();
 const start=c.body.indexOf('CREATE OR REPLACE FUNCTION private.image_claim(');
 const end=c.body.indexOf('CREATE OR REPLACE FUNCTION private.image_finish(',start);
 assert(start>=0&&end>start);
 const original=c.body.slice(start,end).trim();
 const marker=' g:=private.image_authorized_scope(p_attachment);';
 assert.equal(original.split(marker).length,2);
 const queue=`
 IF NOT private.image_inspector_active()THEN RAISE EXCEPTION 'Image unavailable';END IF;
 IF p_attachment IS NULL THEN
  SELECT * INTO g FROM private.image_inspection_scopes
   WHERE inspector_id=i.user_id AND revoked_at IS NULL FOR UPDATE;
  IF FOUND THEN
   SELECT * INTO j FROM private.image_inspection_jobs WHERE scope_id=g.id FOR UPDATE;
   IF g.valid_until>clock_timestamp()AND(j.attachment_id IS NULL OR j.valid_until>clock_timestamp())THEN
    -- Never steal another live session, or revoke a finished lease while ACK replay is valid.
    IF g.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id'THEN RAISE EXCEPTION 'Image unavailable';END IF;
    IF j.attachment_id IS NULL OR j.result IS NOT NULL THEN RETURN NULL;END IF;
    p_attachment:=g.attachment_id;
   ELSE
    UPDATE private.image_inspection_scopes SET revoked_at=clock_timestamp()WHERE id=g.id;
   END IF;
  END IF;
  IF p_attachment IS NULL THEN
   SELECT candidate.id INTO p_attachment FROM private.attachment_catalog candidate
    WHERE candidate.company_id=i.company_id AND candidate.media_kind='image'AND candidate.state='uploaded'
     AND candidate.valid_until>clock_timestamp()AND candidate.expected_sha256=candidate.observed_sha256 AND candidate.expected_bytes=candidate.observed_bytes
     AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='connect-private-images'AND o.name=candidate.object_name AND o.owner_id=candidate.sender_id::text)
     AND NOT EXISTS(SELECT 1 FROM private.image_inspection_jobs queued_job WHERE queued_job.attachment_id=candidate.id AND(queued_job.result IS NOT NULL OR queued_job.valid_until>clock_timestamp()OR queued_job.attempts>=3))
     AND private.attachment_author_lock(candidate.sender_id,candidate.company_id,candidate.conversation_id,candidate.session_id,candidate.valid_until)
    ORDER BY candidate.valid_until,candidate.id LIMIT 1;
   IF p_attachment IS NULL THEN RETURN NULL;END IF;
   INSERT INTO private.image_inspection_scopes(inspector_id,company_id,attachment_id,session_id,sha256,byte_length,decoder_image,valid_from,valid_until)
    SELECT i.user_id,i.company_id,candidate.id,(auth.jwt()->>'session_id')::uuid,candidate.expected_sha256,candidate.expected_bytes,w.decoder_image,
     clock_timestamp(),least(clock_timestamp()+interval'30 seconds',candidate.valid_until,i.valid_until,to_timestamp((auth.jwt()->>'exp')::double precision))
    FROM private.attachment_catalog candidate CROSS JOIN private.image_worker_settings w WHERE candidate.id=p_attachment AND w.singleton;
  END IF;
 END IF;
`;
 const sql=original.replace(marker,queue+marker)+'\n';
 assert(!/\bGRANT\b|CREATE (?:OR REPLACE )?FUNCTION (?!private\.image_claim\()/i.test(sql));
 return {sql,rollback:original+'\n',metadata:{state:'normal-image-queue-local-unapplied',newSecurityDefiners:0,replacedFunctions:['private.image_claim(uuid)'],publicWrapperUnchanged:true,aclChanges:0,remoteApplied:false,sha256:createHash('sha256').update(sql).digest('hex')}};
}
