import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import WorkspaceClient from '@/components/kys-workspace/WorkspaceClient';
import { workspaceAccess } from '@/lib/kysWorkspaceAccess';
export const metadata={title:'KYS - Performans Bakım'};
export default async function Page(){const access=await workspaceAccess('cihaz-bakim-sartlari');if(!access)redirect('/login');if(!access.view)notFound();return <Suspense fallback={<p>Yükleniyor…</p>}><WorkspaceClient module="cihaz-bakim-sartlari"/></Suspense>;}
