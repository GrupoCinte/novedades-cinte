import * as React from 'react';
import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';
import { resolveLogoUrl } from './branding.js';
import type { ConciliacionCorreoLiderEvent } from '../types.js';

interface Props {
  payload: ConciliacionCorreoLiderEvent;
}

function monthLabel(anio: number, mes: number) {
  const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const m = Math.max(1, Math.min(12, Number(mes) || 1));
  return `${names[m - 1]} ${anio}`;
}

export function ConciliacionCorreoLiderEmail({ payload }: Props) {
  const logoUrl = resolveLogoUrl();
  const svc = payload.servicio;
  const ml = monthLabel(svc.anio, svc.mes);
  const recipientName = payload.recipient?.name || 'Líder';
  const viewUrl = payload.actions?.viewUrl;
  const plazoLabel = payload.plazoLabel || (payload.ttlHours ? `${payload.ttlHours} horas` : null);

  return (
    <Html>
      <Head />
      <Preview>
        Conciliación {svc.serviceName} — {ml}
      </Preview>
      <Tailwind>
        <Body className="bg-slate-100 py-8 font-sans">
          <Container className="mx-auto max-w-[720px] rounded-xl border border-slate-200 bg-white p-8">
            <Section className="mb-6 text-center">
              <img
                src={logoUrl}
                alt="Grupo Cinte"
                width={200}
                style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }}
              />
            </Section>
            <Text className="m-0 text-sm text-slate-500">
              Cliente: {svc.cliente} · Servicio: {svc.serviceName} · Mes: {ml}
            </Text>
            <Section className="mt-4">
              <div dangerouslySetInnerHTML={{ __html: payload.introHtml || '' }} />
            </Section>
            <Section>
              <div dangerouslySetInnerHTML={{ __html: payload.tableHtml || '' }} />
            </Section>
            {viewUrl ? (
              <Section className="mt-6 text-center">
                <a
                  href={viewUrl}
                  style={{
                    display: 'inline-block',
                    backgroundColor: '#2F7BB8',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px'
                  }}
                >
                  Visualizar la conciliación
                </a>
                {plazoLabel ? (
                  <Text className="mb-0 mt-4 text-sm text-slate-600">
                    Tienes {plazoLabel} para revisar y decidir. Tras ese plazo el enlace caduca.
                  </Text>
                ) : null}
              </Section>
            ) : null}
            {payload.cierreHtml ? (
              <Section className="mt-4">
                <div dangerouslySetInnerHTML={{ __html: payload.cierreHtml }} />
              </Section>
            ) : (
              <Text className="mb-0 mt-6 text-sm text-slate-600">Saludos cordiales,</Text>
            )}
            <Text className="mb-0 mt-2 text-sm font-semibold text-slate-700">Equipo de Conciliaciones — Grupo Cinte</Text>
            <Text className="mb-0 mt-6 text-xs text-slate-400">Destinatario: {recipientName}</Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
