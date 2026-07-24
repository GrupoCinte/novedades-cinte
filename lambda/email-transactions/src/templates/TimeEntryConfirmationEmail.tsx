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
import type { TimeEntryConfirmationEvent } from '../types.js';

interface Props {
  payload: TimeEntryConfirmationEvent;
}

// ===== COMPONENTE REUTILIZABLE =====
function EntryDataDisplay({ entryData, entryId }: { entryData: any; entryId: string }) {
  return (
    <Section className="mt-6 rounded-lg bg-slate-50 p-4">
      <Text className="m-0 text-sm text-slate-700">
        <strong>ID:</strong> {entryId}
      </Text>
      <Text className="m-0 mt-2 text-sm text-slate-700">
        <strong>Fecha:</strong> {entryData.date}
      </Text>
      <Text className="m-0 mt-2 text-sm text-slate-700">
        <strong>Descripción:</strong> {entryData.description}
      </Text>
      <Text className="m-0 mt-2 text-sm text-slate-700">
        <strong>Cliente:</strong> {entryData.client}
      </Text>
      <Text className="m-0 mt-2 text-sm text-slate-700">
        <strong>Horario:</strong> {entryData.schedule}
      </Text>
    </Section>
  );
}

export function TimeEntryConfirmationEmail({ payload }: Props) {
  const logoUrl = resolveLogoUrl();
  const actionMap = {
    created: 'creada',
    updated: 'actualizada',
    deleted: 'eliminada'
  } as const;
  
  const actionTitleMap = {
    created: 'Creada',
    updated: 'Actualizada',
    deleted: 'Eliminada'
  } as const;
  
  const actionText = actionMap[payload.action as keyof typeof actionMap];
  const actionTitle = actionTitleMap[payload.action as keyof typeof actionTitleMap];

  return (
    <Html>
      <Head />
      <Preview>Confirmación: entrada {actionText}</Preview>
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
            <Heading className="m-0 text-2xl text-slate-900">
              Confirmación: Entrada {actionTitle}
            </Heading>
            <Text className="mb-0 mt-4 text-slate-700">
              Hola {payload.consultant.name || 'consultor'},
            </Text>
            <Text className="mt-2 text-slate-700">
              Tu entrada de tiempo ha sido <strong>{actionText}</strong> correctamente.
            </Text>

            {/* ===== CREAR ===== */}
            {payload.action === 'created' && (
              <EntryDataDisplay entryData={payload.entryData} entryId={payload.entryId} />
            )}

            {/* ===== EDITAR ===== */}
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
              <EntryDataDisplay entryData={payload.entryData} entryId={payload.entryId} />
            )}

            <Hr className="my-6 border-slate-200" />
            <Text className="m-0 text-xs text-slate-500">
              Este es un correo transaccional automático. No respondas a este mensaje.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}