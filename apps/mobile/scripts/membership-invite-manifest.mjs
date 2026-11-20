const target='com.resicheck.connect.demo.PrivacyActivity';
const filter=[
'      <intent-filter android:autoVerify="true">',
'        <action android:name="android.intent.action.VIEW"/>',
'        <category android:name="android.intent.category.DEFAULT"/>',
'        <category android:name="android.intent.category.BROWSABLE"/>',
'        <data android:scheme="https" android:host="connect.resicheck.com.br" android:pathPrefix="/v1/membership-invites/"/>',
'      </intent-filter>',
'    ',
].join('\n');
/** Source preparation only. Never edits a manifest, domain, OS preference or installed app.
 * Enabling requires an explicit candidate build; OFF returns the exact original. */
export function prepareMembershipInviteManifest(source,enabled=false){
 if(typeof source!=='string'||typeof enabled!=='boolean')throw Error('Invitation manifest unavailable');
 if(!enabled)return source;
 if(!source.includes('android:name="com.resicheck.connect.demo.PrivacyApplication"')||!source.includes('android:allowBackup="false"')||!source.includes('android:usesCleartextTraffic="false"')
 ||(source.match(/<activity\b/g)??[]).length!==1||source.includes('/v1/membership-invites/'))throw Error('Invitation manifest unavailable');
 const start=source.indexOf('<activity '),end=source.indexOf('</activity>',start),tag=source.slice(start,source.indexOf('>',start)+1);
 if(start<0||end<0||!tag.includes('android:name="'+target+'"')||!tag.includes('android:launchMode="singleTask"')||!tag.includes('android:exported="true"'))throw Error('Invitation manifest unavailable');
 return source.slice(0,end)+filter+source.slice(end);
}
