// Asunto: Notificación: Cálculo de conciliación disponible en SGU - [nombreServicio]

import React from 'react';
import {
  Text,
  Section,
  SguEmailWrapper,
  globalStyles
} from './emailreact';

export interface SguConciliacionEmailProps {
  nombreServicio: string;
  periodo: string;
  idTransaccion: string | number;
}

export const SguConciliacionEmail: React.FC<SguConciliacionEmailProps> = ({
  nombreServicio = 'Integración Nómina',
  periodo = 'Q3 2026',
  idTransaccion = 'TRX-987654321',
}) => {
  return (
    <SguEmailWrapper>
      <Text style={globalStyles.greeting}>Estimado/a Analista,</Text>

      <Text style={globalStyles.text}>
        Se le informa que la conciliación del servicio <strong>{nombreServicio}</strong> correspondiente al periodo <strong>{periodo}</strong> ya ha sido calculada por el sistema y se encuentra disponible para su gestión.
      </Text>

      {/* Caja de Detalles (Estilo SaaS / Alerta) */}
      <Section style={globalStyles.detailsBox}>
        <Text style={globalStyles.detailsTitle}>Detalles de la tarea:</Text>
        <Text style={globalStyles.detailsText}>
          • <strong>Módulo:</strong> Conciliaciones Finanzas & Operaciones<br />
          • <strong>Estado actual:</strong> Pendiente de aprobación<br />
          • <strong>ID de la transacción:</strong> {idTransaccion}
        </Text>
      </Section>

      <Text style={globalStyles.text}>
        Por favor, realice la verificación pertinente ingresando a la plataforma SGU a la brevedad posible para evitar retrasos en el cierre de operaciones.
      </Text>

      <Text style={globalStyles.text}>Agradecemos su gestión.</Text>
    </SguEmailWrapper>
  );
};

export default SguConciliacionEmail;
