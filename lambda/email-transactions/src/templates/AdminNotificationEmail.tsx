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
import type { FormSubmittedNotificationEvent } from '../types.js';

interface Props {
  payload: FormSubmittedNotificationEvent;
}

export function AdminNotificationEmail({ payload }: Props) {
  const gestionUrl = resolveGestionPublicUrl();
  const logoUrl = resolveLogoUrl();
  return (
    <Html>
      <Head />
      <Preview>Nueva solicitud radicada - {payload.formData.tipoNovedad}</Preview>
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
            <Heading className="m-0 text-2xl text-slate-900">Nueva solicitud para gestionar</Heading>
            <Text className="mb-0 mt-4 text-slate-700">
              Se registró una novedad y requiere revisión administrativa.
            </Text>
            <Section className="mt-6 rounded-lg bg-slate-50 p-4">
              <Text className="m-0 text-sm text-slate-700"><strong>ID:</strong> {payload.novedadId}</Text>
              <Text className="m-0 mt-2 text-sm text-slate-700"><strong>Solicitante:</strong> {payload.user.name} ({payload.user.email})</Text>
              <Text className="m-0 mt-2 text-sm text-slate-700"><strong>Tipo:</strong> {payload.formData.tipoNovedad}</Text>
              <Text className="m-0 mt-2 text-sm text-slate-700"><strong>Cliente:</strong> {payload.formData.cliente}</Text>
              <Text className="m-0 mt-2 text-sm text-slate-700"><strong>Lider:</strong> {payload.formData.lider}</Text>
              <Text className="m-0 mt-2 text-sm text-slate-700"><strong>Estado:</strong> {payload.formData.estado}</Text>
            </Section>

            <Section className="mt-7 text-center">
              <Button href={gestionUrl} className="rounded-md bg-[#004D87] px-6 py-3 text-sm font-semibold text-white">
                Revisar en plataforma administrativa
              </Button>
            </Section>
            <Text className="mt-4 break-all text-center text-xs text-slate-500">
              Si el botón no funciona, copia y pega este enlace: {gestionUrl}
            </Text>
            <Hr className="my-6 border-slate-200" />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
