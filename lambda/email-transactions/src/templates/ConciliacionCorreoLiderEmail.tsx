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
            {payload.actions?.approveUrl || payload.actions?.rejectUrl ? (
              <Section className="mt-6 text-center">
                <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '0 auto' }}>
                  <tbody>
                    <tr>
                      {payload.actions?.approveUrl ? (
                        <td style={{ padding: '0 8px 12px' }}>
                          <a
                            href={payload.actions.approveUrl}
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
                            Aprobar conciliación
                          </a>
                        </td>
                      ) : null}
                      {payload.actions?.rejectUrl ? (
                        <td style={{ padding: '0 8px 12px' }}>
                          <a
                            href={payload.actions.rejectUrl}
                            style={{
                              display: 'inline-block',
                              backgroundColor: '#ffffff',
                              color: '#b91c1c',
                              fontSize: '14px',
                              fontWeight: 600,
                              textDecoration: 'none',
                              padding: '11px 23px',
                              borderRadius: '8px',
                              border: '1px solid #fecaca'
                            }}
                          >
                            Rechazar y solicitar corrección
                          </a>
                        </td>
                      ) : null}
                    </tr>
                  </tbody>
                </table>
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
