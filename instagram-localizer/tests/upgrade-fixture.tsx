// Local fixture only: synthetic credentials and mocked authorization never ship in the app.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { supabase, type Member } from '../src/lib/auth';
import { DEFAULT_SETTINGS, saveSettings } from '../src/lib/storage';
import '../src/index.css';
if (!import.meta.env.DEV || !['127.0.0.1','localhost'].includes(location.hostname)) throw new Error('Local tests only');
const member={id:'upgrade-fixture',role:'member',status:'approved',display_name:'검사',daily_limit:100} as Member;
const fixture=window as any;
fixture.reservations=0;
(supabase as any).rpc=async()=>{fixture.reservations++;return {error:fixture.appLimit?{message:'오늘 앱 사용 한도에 도달했어요.'}:null};};
(supabase as any).auth.getSession=async()=>({data:{session:{user:{id:member.id},access_token:'synthetic-auth'}}});
saveSettings({...DEFAULT_SETTINGS,apifyEnabled:true,apifyToken:'synthetic-apify'},member.id);
createRoot(document.getElementById('root')!).render(<App member={member}/>);
