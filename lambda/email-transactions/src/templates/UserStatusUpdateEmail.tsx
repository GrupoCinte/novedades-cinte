import * as React from 'react';
import {
  Body,
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
import { resolveLogoUrl } from './branding.js';
import type { FormStatusChangedNotificationEvent } from '../types.js';

interface Props {
  payload: FormStatusChangedNotificationEvent;
}

export function UserStatusUpdateEmail({ payload }: Props) {
  const isApproved = payload.formData.estado === 'Aprobado';
  const logoUrl = resolveLogoUrl();
  return (
    <Html>
      <Head />
      <Preview>
        Actualizacion de solicitud {payload.novedadId}: {payload.formData.estado}
      </Preview>
      <Tailwind>
        <Body className="bg-slate-100 py-8 font-sans">
          <Container className="mx-auto max-w-[600px] rounded-xl border border-slate-200 bg-white p-8">
            <Section className="mb-6 text-center">
              <img
                src={logoUrl}
                alt="Grupo Cinte"
                width={200}
                style={{ display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' }}
              />
            </Section>
            <Heading className="m-0 text-2xl text-slate-900">Actualizacion de estado</Heading>
            <Text className="mb-0 mt-4 text-slate-700">
              Hola {payload.user.name || 'usuario'}, tu solicitud fue{' '}
              <strong>{payload.formData.estado}</strong>.
            </Text>
            <Text className="mt-2 text-slate-700">
              {isApproved
                ? 'Tu novedad fue aprobada por el equipo de gestion.'
                : 'Tu novedad fue rechazada por el equipo de gestion. Si requieres aclaraciones, contacta al area administrativa.'}
            </Text>
            <Section className="mt-6 rounded-lg bg-slate-50 p-4">
              <Text className="m-0 text-sm text-slate-600"><strong>ID:</strong> {payload.novedadId}</Text>
              <Text className="m-0 mt-2 text-sm text-slate-600"><strong>Tipo:</strong> {payload.formData.tipoNovedad}</Text>
              <Text className="m-0 mt-2 text-sm text-slate-600"><strong>Cliente:</strong> {payload.formData.cliente}</Text>
              <Text className="m-0 mt-2 text-sm text-slate-600"><strong>Estado anterior:</strong> {payload.statusChange.previousEstado || 'Pendiente'}</Text>
              <Text className="m-0 mt-2 text-sm text-slate-600"><strong>Nuevo estado:</strong> {payload.statusChange.newEstado}</Text>
            </Section>
            <Hr className="my-6 border-slate-200" />
            <Text className="m-0 text-xs text-slate-500">
              Este es un correo transaccional automatico. No respondas a este mensaje.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
