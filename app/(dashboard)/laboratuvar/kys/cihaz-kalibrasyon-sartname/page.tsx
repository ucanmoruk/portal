import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import WorkspaceClient from '@/components/kys-workspace/WorkspaceClient';
import { workspaceAccess } from '@/lib/kysWorkspaceAccess';
export const metadata={title:'KYS - Kalibrasyon Teknik Şartnamesi'};
export default async function Page(){const access=await workspaceAccess('cihaz-kalibrasyon-sartname');if(!access)redirect('/login');if(!access.view)notFound();return <Suspense fallback={<p>Yükleniyor…</p>}><WorkspaceClient module="cihaz-kalibrasyon-sartname"/></Suspense>;}
