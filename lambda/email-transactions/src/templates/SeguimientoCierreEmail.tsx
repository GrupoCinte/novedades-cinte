import * as React from 'react';
import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';
import { resolveLogoUrl } from './branding.js';
import type { SeguimientoCierreEvent } from '../types.js';

interface Props {
  payload: SeguimientoCierreEvent;
}

export function SeguimientoCierreEmail({ payload }: Props) {
  const logoUrl = resolveLogoUrl();
  const acta = payload.acta;
  const tipoLabel = payload.tipo === 'consultor' ? 'Consultor' : 'Cliente';

  return (
    <Html>
      <Head />
      <Preview>
        Acta de seguimiento finalizada — {acta.cliente}
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
            <Text className="m-0 text-xl font-semibold text-slate-800">
              Seguimiento {tipoLabel} finalizado
            </Text>
            <Text className="mt-2 text-sm text-slate-500">
              Cliente: {acta.cliente} · Fecha: {acta.fecha}
              {acta.modalidad ? ` · Modalidad: ${acta.modalidad}` : ''}
            </Text>
            {acta.temasTratados ? (
              <Section className="mt-4">
                <Text className="m-0 text-sm font-semibold text-slate-700">Temas tratados</Text>
                <Text className="mt-1 text-sm text-slate-600">{acta.temasTratados}</Text>
              </Section>
            ) : null}
            {acta.feedback ? (
              <Section className="mt-4">
                <Text className="m-0 text-sm font-semibold text-slate-700">Feedback</Text>
                <Text className="mt-1 text-sm text-slate-600">{acta.feedback}</Text>
              </Section>
            ) : null}
            {acta.compromisosResumen ? (
              <Section className="mt-4">
                <Text className="m-0 text-sm font-semibold text-slate-700">Compromisos</Text>
                <Text className="mt-1 text-sm text-slate-600">{acta.compromisosResumen}</Text>
              </Section>
            ) : null}
            <Text className="mb-0 mt-6 text-sm text-slate-600">Saludos cordiales,</Text>
            <Text className="mb-0 mt-2 text-sm font-semibold text-slate-700">
              Equipo de Servicio — Grupo Cinte
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
