"""Build one inert, credential-free installation packet from reviewed local inputs.
No subprocess, remote call, Docker, SQL execution, login or service action.
"""
import hashlib,importlib.util,json,pathlib,sys,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[4]
NORMAL=ROOT/'supabase/runtime/image-node/normal';SQL=ROOT/'supabase/candidates/image-message/normal-activation'
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 args=sys.argv[1:]
 if args!=['--prepare-only']and not(len(args)==3 and args[:2]==['--prepare-only','--public-config']):raise ValueError('explicit prepare only/public input')
 spec=importlib.util.spec_from_file_location('normal_install',NORMAL/'install-normal.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 old=json.loads((NORMAL/'source-manifest.PREPARED.json').read_text());names={x['path']for x in old['files']}
 # Historical runtime exporter and proof harnesses are not installation inputs.
 names={x for x in names if not x.startswith('supabase/runtime/image-node/normal/linux-validation/')}
 names.update({'supabase/runtime/image-node/normal/'+x for x in ['install-normal.py','prepare-install.py','INSTALL-NORMAL.md','credential-acl.py','activation-gate.mjs','linux-validation/selected-runtime-v4.py']})
 names.update({'supabase/candidates/image-message/normal-activation/'+x for x in ['install.MANAGED.CLOSED.UNAPPLIED.sql','rollback.MANAGED.CLOSED.UNAPPLIED.sql','install.MANAGED.REQUEST.UNAPPLIED.json','rollback.MANAGED.REQUEST.UNAPPLIED.json','activate.NORMAL.UNAPPLIED.sql','close.NORMAL.UNAPPLIED.sql','restore.BASELINE-ACL.UNAPPLIED.sql','audit.NORMAL.READONLY.sql','activate.NORMAL.REQUEST.UNAPPLIED.json','close.NORMAL.REQUEST.UNAPPLIED.json']})
 files={x:(ROOT/x).read_bytes()for x in sorted(names)}
 # Public client bindings only, from approved project-scoped local inputs.
 public_path=pathlib.Path(args[2])if len(args)==3 else ROOT/'apps/mobile/candidates/messaging33/connect-public-config.INPUT.json'
 if not public_path.exists():
  prior=json.loads((ROOT/'apps/mobile/candidates/messaging33/builder-validation.json').read_text());public_path=pathlib.Path(prior['candidateRoot'])/'apps/mobile/candidates/messaging33/connect-public-config.INPUT.json';assert sha(json.dumps(json.loads(public_path.read_text()),separators=(',',':')).encode())==prior['publicConfigSha256']
 client=json.loads(public_path.read_text());anon=json.loads((ROOT/'output/audio-edge-public-config.json').read_text());config=json.loads((NORMAL/'CONFIG.example.json').read_text())
 assert client['projectRef']==anon['projectRef']==config['projectRef'];config['publishableKey']=client['publishableKey'];config['publicAnonKey']=anon['publicAnonKey'];m.validate_config(config)
 public_config=(json.dumps(config,indent=2)+'\n').encode()
 edge=json.loads((ROOT/'supabase/candidates/image-message/normal-service-edge-preparation.json').read_text());active_path=ROOT/edge['variants']['active']['file'];active=active_path.read_bytes();assert sha(active)=='2b7ac40ab161109a57f31fa108d50456e4c48f0ed42d50ae88328a3cfc71033e'
 off=(ROOT/'supabase/candidates/image-message/normal-edge-off-exact/ROLLBACK.REQUEST.UNAPPLIED.json').read_bytes();assert sha(off)=='924148cb5b701da7ab7fae806c8d6f2933715b180d499f0843c72bcc9b42729c'
 for name,data in [('edge-ACTIVE.REQUEST.UNAPPLIED.json',active),('edge-OFF-EXACT.REQUEST.UNAPPLIED.json',off)]:
  req=json.loads(data);assert req['project_id']=='ibdlvlwdzmsrbqadrudb'and req['verify_jwt']is True and req['name']=='connect-image-transfer-v1';files['supabase/candidates/image-message/normal-activation/'+name]=data
 manifest={'purpose':'connect-image-normal-install-v1','defaultEnabled':False,'projectId':config['projectRef'],'companyIds':config['companyIds'],'files':[{'path':name,'sha256':sha(data),'bytes':len(data)}for name,data in sorted(files.items())],'publicConfigSha256':sha(public_config),'credentialsIncluded':False,'publicClientBindingsIncluded':True,'runtimeBundled':False,'runtimeSource':m.IMAGE}
 manifest_bytes=(json.dumps(manifest,indent=2)+'\n').encode();fingerprint=sha(manifest_bytes);out=ROOT/'output/image-normal-install'/fingerprint;out.mkdir(parents=True,exist_ok=True)
 archive=out/'connect-image-normal-install-v1.zip'
 allfiles={**files,'PACKAGE-MANIFEST.json':manifest_bytes,'CONFIG.PUBLIC.INPUT.json':public_config}
 with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6)as z:
  for name,data in sorted(allfiles.items()):
   info=zipfile.ZipInfo(name,date_time=(2026,11,20,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100600<<16;z.writestr(info,data)
 with zipfile.ZipFile(archive)as z:
  assert z.testzip()is None and set(z.namelist())==set(allfiles)
  for name,data in allfiles.items():assert z.read(name)==data
 # Runtime source fingerprint updated; no media/auth/old tests are run.
 runtime_names=sorted(n for n in names if not n.startswith('supabase/candidates/'))
 source={'state':'normal-source-installer-candidate-off-not-installed','files':[{'path':n,'sha256':sha(files[n]),'bytes':len(files[n])}for n in runtime_names],'fingerprint':sha(json.dumps([(n,sha(files[n]))for n in runtime_names],separators=(',',':')).encode()),'runtimeStagingRequired':True,'linuxTransientAndElfEvidenceReused':True,'linuxPersistentInstallerTested':False,'installed':False,'credentialsIncluded':False}
 (NORMAL/'source-manifest.PREPARED.json').write_text(json.dumps(source,indent=2)+'\n')
 receipt={'state':'prepared-and-zip-verified-not-transferred-not-installed','zip':archive.relative_to(ROOT).as_posix(),'sha256':sha(archive.read_bytes()),'bytes':archive.stat().st_size,'manifestSha256':fingerprint,'files':len(files),'sourceFingerprint':source['fingerprint'],'installerSha256':sha(files['supabase/runtime/image-node/normal/install-normal.py']),'extractorSha256':sha(files['supabase/runtime/image-node/normal/linux-validation/selected-runtime-v4.py']),'credentialsIncluded':False,'publicClientBindingsIncluded':True,'defaultEnabled':False,'remoteCalls':0,'linuxInstallExecuted':False,'runtimeStagingRequired':True}
 (NORMAL/'install-package.PREPARED.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
if __name__=='__main__':main()
