import { useParams } from 'react-router-dom';
import EcosistemaPlaceholder from './EcosistemaPlaceholder';

export default function PortalSection({ nav, portalLabel }) {
  const { section } = useParams();
  const item = nav.find((x) => x.id === section);
  const title = item?.label || 'Sección';

  return <EcosistemaPlaceholder title={title} portalLabel={portalLabel} />;
}
