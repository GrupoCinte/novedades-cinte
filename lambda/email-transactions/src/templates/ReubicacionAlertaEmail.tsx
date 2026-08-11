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

interface ReubicacionAlertaPayload {
  eventId: string;
  casoId: string;
  consultor: {
    nombre: string;
    cedula: string;
  };
  hito: 'dia_0' | 'dia_3' | 'dia_5' | 'extension' | 'novedad';
  fechaFin: string;
  diasRestantes?: number;
  estado?: string;
  clienteActual?: string;
  clienteDestino?: string;
  gp?: {
    nombre?: string;
    email?: string;
  };
  observacion?: string;
  destinatarios: string[];
}

interface Props {
  payload: ReubicacionAlertaPayload;
}

// ===== UTILIDAD PARA FORMATEAR NOMBRES =====

function formatName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ===== COMPONENTE REUTILIZABLE =====

interface CaseDataDisplayProps {
  readonly payload: ReubicacionAlertaPayload;
}

function CaseDataDisplay({ payload }: CaseDataDisplayProps) {
  const hitoMap: Record<string, string> = {
    dia_0: 'Día 0 - Inicio del ciclo',
    dia_3: 'Día hábil 3 - Recordatorio',
    dia_5: 'Día hábil 5 - Último día',
    extension: 'Extensión de plazo',
    novedad: 'Novedad en el caso'
  };

  return (
    <Section className="mt-6 rounded-lg bg-slate-50 p-4">
      <Text className="m-0 text-sm text-slate-700">
        <strong>Consultor:</strong> {formatName(payload.consultor.nombre)} ({payload.consultor.cedula})
      </Text>
      <Text className="m-0 mt-2 text-sm text-slate-700">
        <strong>Cliente actual:</strong> {payload.clienteActual || 'N/A'}
      </Text>
      {payload.clienteDestino && (
        <Text className="m-0 mt-2 text-sm text-slate-700">
          <strong>Cliente destino:</strong> {payload.clienteDestino}
        </Text>
      )}
      <Text className="m-0 mt-2 text-sm text-slate-700">
        <strong>Fecha fin:</strong> {payload.fechaFin}
      </Text>
      <Text className="m-0 mt-2 text-sm text-slate-700">
        <strong>Días restantes:</strong> {payload.diasRestantes !== undefined ? payload.diasRestantes : '—'}
      </Text>
      <Text className="m-0 mt-2 text-sm text-slate-700">
        <strong>Estado:</strong> {payload.estado || 'En proceso'}
      </Text>
      {payload.gp?.nombre && (
        <Text className="m-0 mt-2 text-sm text-slate-700">
          <strong>GP responsable:</strong> {formatName(payload.gp.nombre)}
          {payload.gp.email ? ` (${payload.gp.email})` : ''}
        </Text>
      )}
      {payload.observacion && (
        <Text className="m-0 mt-2 text-sm text-slate-700">
          <strong>Observación CH:</strong> "{payload.observacion}"
        </Text>
      )}
    </Section>
  );
}

export function ReubicacionAlertaEmail({ payload }: Readonly<Props>) {
  const logoUrl = resolveLogoUrl();
  const hitoMap: Record<string, string> = {
    dia_0: 'Día 0 - Inicio del ciclo',
    dia_3: 'Día hábil 3 - Recordatorio',
    dia_5: 'Día hábil 5 - Último día',
    extension: 'Extensión de plazo',
    novedad: 'Novedad en el caso'
  };

  const hitoLabel = hitoMap[payload.hito] || payload.hito;
  const formattedGpName = payload.gp?.nombre ? formatName(payload.gp.nombre) : 'equipo';

  return (
    <Html>
      <Head />
      <Preview>Alerta de reubicación - {formatName(payload.consultor.nombre)}</Preview>
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
              Alerta de Reubicación
            </Heading>
            <Text className="mb-0 mt-4 text-slate-700">
              Hola {formattedGpName},
            </Text>
            <Text className="mt-2 text-slate-700">
              Se ha generado una alerta para el siguiente caso: <strong>{hitoLabel}</strong>
            </Text>

            {/* Datos del caso (componente reutilizable) */}
            <CaseDataDisplay payload={payload} />

            <Hr className="my-6 border-slate-200" />
            <Text className="m-0 text-xs text-slate-500">
              Este es un correo transaccional automático generado por el sistema de Reubicaciones.
              No respondas a este mensaje.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

ReubicacionAlertaEmail.defaultProps = {
  payload: {
    eventId: 'test-123',
    casoId: 'test-caso',
    consultor: { nombre: 'JULIAN CAMILO RODRIGUEZ MUÑOZ', cedula: '1003967698' },
    hito: 'novedad',  // ← CAMBIAR DE 'dia_5' A 'novedad'
    fechaFin: '2026-08-10',
    diasRestantes: 0,
    estado: 'Con novedad',  // ← CAMBIAR DE 'En proceso' A 'Con novedad'
    clienteActual: 'BANCO DE BOGOTÁ',
    clienteDestino: 'BANCO DE BOGOTÁ',
    gp: { nombre: 'MÓNICA LISED BOLIVAR HERRERA', email: 'mbolivar@grupocinte.com' },
    observacion: 'Sin GP asignado',  // ← AGREGAR OBSERVACIÓN
    destinatarios: ['mbolivar@grupocinte.com', 'admin@cinte.com']
  }
};

export default ReubicacionAlertaEmail; 