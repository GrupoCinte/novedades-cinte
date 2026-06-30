import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text
} from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';
import { resolveGestionPublicUrl, resolveLogoUrl } from './branding.js';
import type { ConciliacionServicioFinalizadaEvent } from '../types.js';

interface Props {
  payload: ConciliacionServicioFinalizadaEvent;
}

function formatCop(n: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(n) || 0);
}

function monthLabel(anio: number, mes: number) {
  const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const m = Math.max(1, Math.min(12, Number(mes) || 1));
  return `${names[m - 1]} ${anio}`;
}

export function ConciliacionServicioFinalizadaEmail({ payload }: Props) {
  const logoUrl = resolveLogoUrl();
  const actionUrl = String(payload.admin?.actionUrl || '').trim() || resolveGestionPublicUrl();
  const svc = payload.servicio;
  const tot = payload.totales;
  const ml = monthLabel(svc.anio, svc.mes);

  return (
    <Html>
      <Head />
      <Preview>
        Servicio {svc.serviceName} ({svc.cliente}) — cierre completo {ml}
      </Preview>
      <Tailwind>
        <Body className="bg-slate-100 py-8 font-sans">
          <Container className="mx-auto max-w-[640px] rounded-xl border border-slate-200 bg-white p-8">
            <Section className="mb-6 text-center">
              <img
                src={logoUrl}
                alt="Grupo Cinte"
                width={200}
                style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }}
              />
            </Section>
            <Heading className="m-0 text-2xl text-slate-900">Conciliación de servicio finalizada</Heading>
            <Text className="mb-0 mt-4 text-slate-700">
              Todos los consultores del servicio fueron aprobados por Finanzas para {ml}.
            </Text>
            <Section className="mt-6 rounded-lg bg-slate-50 p-4">
              <Text className="m-0 text-sm text-slate-700">
                <strong>Cliente:</strong> {svc.cliente}
              </Text>
              <Text className="m-0 mt-2 text-sm text-slate-700">
                <strong>Servicio:</strong> {svc.serviceName}
              </Text>
              <Text className="m-0 mt-2 text-sm text-slate-700">
                <strong>Mes facturación:</strong> {ml}
              </Text>
              {payload.approvedBy?.nombre || payload.approvedBy?.email ? (
                <Text className="m-0 mt-2 text-sm text-slate-700">
                  <strong>Aprobado por Finanzas:</strong>{' '}
                  {[payload.approvedBy?.nombre, payload.approvedBy?.email].filter(Boolean).join(' — ')}
                </Text>
              ) : null}
            </Section>
            <Section className="mt-4 rounded-lg border border-slate-200 p-4">
              <Text className="m-0 text-sm font-semibold text-slate-800">Totales del servicio</Text>
              <Text className="m-0 mt-2 text-sm text-slate-700">
                <strong>Tarifas:</strong> {formatCop(tot.tarifaSum)}
              </Text>
              <Text className="m-0 mt-1 text-sm text-slate-700">
                <strong>Deducción:</strong> {formatCop(tot.deduccionSum)}
              </Text>
              <Text className="m-0 mt-1 text-sm text-slate-700">
                <strong>Incremento:</strong> {formatCop(tot.incrementoSum)}
              </Text>
              <Text className="m-0 mt-1 text-sm font-semibold text-slate-900">
                <strong>Factura neta:</strong> {formatCop(tot.facturaSum)}
              </Text>
            </Section>
            {payload.consultores?.length ? (
              <Section className="mt-4">
                <Text className="m-0 text-sm font-semibold text-slate-800">
                  Consultores ({payload.consultores.length})
                </Text>
                {payload.consultores.slice(0, 25).map((c) => (
                  <Text key={`${c.cedula}-${c.nombre}`} className="m-0 mt-1 text-xs text-slate-600">
                    {c.nombre} — {c.cedula}: {formatCop(c.facturaCop)} ({c.estado})
                  </Text>
                ))}
                {payload.consultores.length > 25 ? (
                  <Text className="m-0 mt-2 text-xs text-slate-500">
                    … y {payload.consultores.length - 25} consultor(es) más en la plataforma.
                  </Text>
                ) : null}
              </Section>
            ) : null}
            <Section className="mt-7 text-center">
              <Button href={actionUrl} className="rounded-md bg-[#004D87] px-6 py-3 text-sm font-semibold text-white">
                Abrir facturación del servicio
              </Button>
            </Section>
            <Text className="mt-4 break-all text-center text-xs text-slate-500">
              Si el botón no funciona, copia y pega este enlace: {actionUrl}
            </Text>
            <Hr className="my-6 border-slate-200" />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
