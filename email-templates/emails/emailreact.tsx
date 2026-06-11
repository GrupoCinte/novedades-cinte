import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Heading,
  Hr,
  Text,
} from '@react-email/components';

// Exportamos todos los componentes base para que puedan ser usados libremente
export * from '@react-email/components';

interface SguEmailWrapperProps {
  children: React.ReactNode;
  previewText?: string;
}

// Este es el componente que empaqueta y da la identidad gráfica a todos los correos
export const SguEmailWrapper: React.FC<SguEmailWrapperProps> = ({ children, previewText }) => {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header Corporativo Global */}
          <Section style={styles.header}>
            <Heading style={styles.heading}>Sistema de Notificaciones SGU</Heading>
          </Section>

          {/* Contenido inyectado dinámicamente por cada tipo de correo */}
          <Section style={styles.content}>
            {children}

            <Hr style={styles.hr} />

            {/* Firma Global */}
            <Text style={styles.signature}>
              Atentamente,<br />
              <strong>Sistema de Notificaciones SGU</strong>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export const globalStyles = {
  text: {
    color: '#475569',
    fontSize: '16px',
    lineHeight: '26px',
    marginBottom: '24px',
    marginTop: '0',
  },
  detailsBox: {
    backgroundColor: '#f8fafc',
    borderLeft: '4px solid #3b82f6',
    borderRadius: '4px',
    padding: '16px 24px',
    marginBottom: '24px',
  },
  detailsTitle: {
    color: '#0f172a',
    fontSize: '16px',
    fontWeight: '700',
    margin: '0 0 12px 0',
  },
  detailsText: {
    color: '#334155',
    fontSize: '15px',
    lineHeight: '28px',
    margin: '0',
  },
  greeting: {
    color: '#1e293b',
    fontSize: '16px',
    lineHeight: '24px',
    fontWeight: '600',
    marginBottom: '16px',
    marginTop: '0',
  },
};

const styles = {
  body: {
    backgroundColor: '#f4f7fa',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    padding: '40px 0',
  },
  container: {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '0',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
    maxWidth: '600px',
    overflow: 'hidden',
    border: '1px solid #eaebed',
  },
  header: {
    backgroundColor: '#0f172a',
    padding: '24px 32px',
    textAlign: 'center' as const,
  },
  heading: {
    color: '#ffffff',
    fontSize: '20px',
    margin: '0',
    fontWeight: '600',
    letterSpacing: '0.5px',
  },
  content: {
    padding: '32px',
  },
  hr: {
    borderColor: '#e2e8f0',
    borderStyle: 'solid',
    borderWidth: '1px 0 0 0',
    margin: '32px 0',
  },
  signature: {
    color: '#64748b',
    fontSize: '15px',
    lineHeight: '22px',
    margin: '0',
  },
};
