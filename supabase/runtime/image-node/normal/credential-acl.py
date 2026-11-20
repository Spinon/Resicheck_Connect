"""Fixed systemd credential METADATA verifier, same non-root UID as Node.
Never opens credential contents, connects to a network or accepts a path/input.
"""
import os,sys,pathlib,stat,struct,json
DIR=pathlib.Path('/run/credentials/connect-image-inspector.service')
def exact_acl(blob,uid,permission):
 if len(blob)!=44 or struct.unpack_from('<I',blob)[0]!=2:return False
 rows=list(struct.iter_unpack('<HHI',blob[4:]));undefined=0xffffffff
 return rows==[(1,permission,undefined),(2,permission,uid),(4,0,undefined),(16,permission,undefined),(32,0,undefined)]
def main():
 uid=os.getuid();gid=os.getgid()
 if sys.argv[1:]or uid<=0 or gid<=0 or os.geteuid()!=uid or any(g!=gid for g in os.getgroups()):raise ValueError()
 file=DIR/'image-auth';d=DIR.lstat();s=file.lstat()
 if DIR.is_symlink()or file.is_symlink()or not stat.S_ISDIR(d.st_mode)or not stat.S_ISREG(s.st_mode)or DIR.resolve()!=DIR or d.st_uid!=0 or s.st_uid!=0 or d.st_gid!=0 or s.st_gid!=0 or stat.S_IMODE(d.st_mode)!=0o550 or stat.S_IMODE(s.st_mode)!=0o440 or s.st_nlink!=1 or not 0<s.st_size<=8192:raise ValueError()
 if not all(os.statvfs(p).f_flag & os.ST_RDONLY for p in [DIR,file]):raise ValueError()
 if not exact_acl(os.getxattr(DIR,'system.posix_acl_access'),uid,5)or not exact_acl(os.getxattr(file,'system.posix_acl_access'),uid,4):raise ValueError()
 if not os.access(file,os.R_OK)or not os.access(DIR,os.X_OK):raise ValueError()
 print(json.dumps({'admitted':True,'uid':uid,'gid':gid,'fileIno':str(s.st_ino),'fileDev':str(s.st_dev),'directoryIno':str(d.st_ino),'directoryDev':str(d.st_dev)}))
if __name__=='__main__':
 try:main()
 except Exception:sys.stderr.write('credential-acl-unavailable\n');sys.exit(1)
