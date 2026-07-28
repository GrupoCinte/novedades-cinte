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
import type { TimeEntryConfirmationEvent } from '../types.js';

interface Props {
  payload: TimeEntryConfirmationEvent;
}

// ===== COMPONENTE REUTILIZABLE =====
function EntryDataDisplay({ entryData, entryId }: { entryData: any; entryId: string }) {
  return (
    <Section className="mt-6 rounded-lg bg-slate-50 p-4">
      <Text className="m-0 text-sm text-slate-700"><strong>ID:</strong> {entryId}</Text>
      <Text className="m-0 mt-2 text-sm text-slate-700"><strong>Consultor:</strong> {entryData.consultantName} ({entryData.consultantEmail})</Text>
      <Text className="m-0 mt-2 text-sm text-slate-700"><strong>Fecha:</strong> {entryData.date}</Text>
      <Text className="m-0 mt-2 text-sm text-slate-700"><strong>Descripción:</strong> {entryData.description}</Text>
      <Text className="m-0 mt-2 text-sm text-slate-700"><strong>Cliente:</strong> {entryData.client}</Text>
      <Text className="m-0 mt-2 text-sm text-slate-700"><strong>Horario:</strong> {entryData.schedule}</Text>
    </Section>
  );
}

export function AdminTimeEntryNotificationEmail({ payload }: Props) {
  const gestionUrl = resolveGestionPublicUrl();
  const logoUrl = resolveLogoUrl();
  
  const actionText = {
    created: 'registrado',
    updated: 'actualizado',
    deleted: 'eliminado'
  }[payload.action];

  // ❌ ELIMINAR actionTitle (no se usa)

  return (
    <Html>
      <Head />
      <Preview>Nueva actividad {actionText} por {payload.consultant.name}</Preview>
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
            <Heading className="m-0 text-2xl text-slate-900">Nueva actividad {actionText}</Heading>
            <Text className="mb-0 mt-4 text-slate-700">
              El consultor <strong>{payload.consultant.name}</strong> ha {actionText} una actividad.
            </Text>

            {/* ===== CREAR: Mostrar todos los datos ===== */}
            {payload.action === 'created' && (
              <EntryDataDisplay 
                entryData={{
                  ...payload.entryData,
                  consultantName: payload.consultant.name,
                  consultantEmail: payload.consultant.email
                }} 
                entryId={payload.entryId} 
              />
            )}

            {/* ===== EDITAR: Solo mostrar cambios realizados ===== */}
            {payload.action === 'updated' && payload.previousData && (
              <>
                <Heading className="m-0 mt-6 text-lg text-slate-900">Cambios realizados:</Heading>
                <Section className="mt-4 rounded-lg bg-slate-50 p-4">
                  {payload.previousData.date && payload.previousData.date !== payload.entryData.date && (
                    <Text className="m-0 text-sm text-slate-700">
                      <strong>Fecha:</strong> {payload.previousData.date} → {payload.entryData.date}
                    </Text>
                  )}
                  {payload.previousData.description && payload.previousData.description !== payload.entryData.description && (
                    <Text className="m-0 mt-2 text-sm text-slate-700">
                      <strong>Descripción:</strong> {payload.previousData.description} → {payload.entryData.description}
                    </Text>
                  )}
                  {payload.previousData.client && payload.previousData.client !== payload.entryData.client && (
                    <Text className="m-0 mt-2 text-sm text-slate-700">
                      <strong>Cliente:</strong> {payload.previousData.client} → {payload.entryData.client}
                    </Text>
                  )}
                  {payload.previousData.schedule && payload.previousData.schedule !== payload.entryData.schedule && (
                    <Text className="m-0 mt-2 text-sm text-slate-700">
                      <strong>Horario:</strong> {payload.previousData.schedule} → {payload.entryData.schedule}
                    </Text>
                  )}
                </Section>
              </>
            )}

            {/* ===== ELIMINAR ===== */}
            {payload.action === 'deleted' && (
              <EntryDataDisplay 
                entryData={{
                  ...payload.entryData,
                  consultantName: payload.consultant.name,
                  consultantEmail: payload.consultant.email
                }} 
                entryId={payload.entryId} 
              />
            )}

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