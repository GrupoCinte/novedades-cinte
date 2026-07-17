import * as React from 'react';
import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';
import { resolveLogoUrl } from './branding.js';
import type { ConciliacionStakeholdersAvisoEvent } from '../types.js';

interface Props {
  payload: ConciliacionStakeholdersAvisoEvent;
}

function monthLabel(anio: number, mes: number) {
  const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const m = Math.max(1, Math.min(12, Number(mes) || 1));
  return `${names[m - 1]} ${anio}`;
}

function kindTitle(kind: string) {
  if (kind === 'enviada') return 'Correo de conciliación enviado al líder';
  if (kind === 'aprobada') return 'Conciliación aprobada por el líder';
  if (kind === 'rechazada') return 'Conciliación rechazada por el líder';
  if (kind === 'parcial') return 'Conciliación cerrada con aprobaciones y rechazos';
  return 'Aviso de conciliación';
}

export function ConciliacionStakeholdersAvisoEmail({ payload }: Props) {
  const logoUrl = resolveLogoUrl();
  const svc = payload.servicio;
  const ml = monthLabel(svc.anio, svc.mes);
  const title = kindTitle(payload.kind);

  return (
    <Html>
      <Head />
      <Preview>
        {title} — {svc.cliente}
      </Preview>
      <Tailwind>
        <Body className="bg-slate-100 py-8 font-sans">
          <Container className="mx-auto max-w-[640px] rounded-xl border border-slate-200 bg-white p-8">
            <Section className="mb-6 text-center">
              <img
                src={logoUrl}
                alt="Grupo Cinte"
                width={180}
                style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }}
              />
            </Section>
            <Text className="m-0 text-lg font-semibold text-slate-800">{title}</Text>
            <Text className="mt-3 text-sm text-slate-600">
              Cliente: <strong>{svc.cliente}</strong>
              <br />
              Servicio: <strong>{svc.serviceName}</strong>
              <br />
              Periodo: <strong>{ml}</strong>
            </Text>
            {payload.lider?.email ? (
              <Text className="mt-3 text-sm text-slate-600">
                Líder: {payload.lider.nombre || payload.lider.email} ({payload.lider.email})
              </Text>
            ) : null}
            {payload.kind !== 'enviada' ? (
              <Text className="mt-3 text-sm text-slate-600">
                Aprobados: {payload.resumen?.aprobados ?? 0} · Rechazados: {payload.resumen?.rechazados ?? 0}
              </Text>
            ) : null}
            {payload.admin?.actionUrl ? (
              <Section className="mt-6 text-center">
                <a
                  href={payload.admin.actionUrl}
                  style={{
                    display: 'inline-block',
                    backgroundColor: '#2F7BB8',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    padding: '10px 20px',
                    borderRadius: '8px'
                  }}
                >
                  Abrir facturación
                </a>
              </Section>
            ) : null}
            <Text className="mb-0 mt-8 text-xs text-slate-400">Equipo de Conciliaciones — Grupo Cinte</Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
