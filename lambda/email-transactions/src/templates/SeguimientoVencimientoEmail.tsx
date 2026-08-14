import * as React from 'react';
import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';
import { resolveLogoUrl } from './branding.js';
import type { SeguimientoVencimientoEvent } from '../types.js';

interface Props {
  payload: SeguimientoVencimientoEvent;
}

export function SeguimientoVencimientoEmail({ payload }: Props) {
  const logoUrl = resolveLogoUrl();
  const dias = payload.kind === 'T5' ? '5' : '1';
  const tipoLabel = payload.tipo === 'consultor' ? 'Consultor' : 'Cliente';

  return (
    <Html>
      <Head />
      <Preview>
        Seguimiento próximo a vencer ({dias} día{dias === '1' ? '' : 's'}) — {payload.sujetoLabel}
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
              Recordatorio de vencimiento (T-{dias})
            </Text>
            <Text className="mt-3 text-sm text-slate-600">
              El seguimiento tipo <strong>{tipoLabel}</strong> de <strong>{payload.sujetoLabel}</strong>{' '}
              vence el <strong>{payload.venceEl}</strong> (faltan {dias} día{dias === '1' ? '' : 's'}).
            </Text>
            <Text className="mt-4 text-sm text-slate-600">
              Renueva el acta mensual a tiempo desde el submódulo Seguimiento del portal.
            </Text>
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
