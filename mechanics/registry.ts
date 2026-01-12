import { MechanicRegistry } from './types';
import DataExportMechanic from './modules/DataExportMechanic';
import DocumentsMechanic from './modules/DocumentsMechanic';
import EmailMechanic from './modules/EmailMechanic';
import ExperimentalMapMechanic from './modules/ExperimentalMapMechanic';
import MapMechanic from './modules/MapMechanic';
import OfficeMechanic from './modules/OfficeMechanic';
import ScheduleMechanic from './modules/ScheduleMechanic';
import SummaryMechanic from './modules/SummaryMechanic';

export const MECHANIC_REGISTRY: MechanicRegistry = {
  office: {
    mechanic_id: 'office',
    label: 'Oficina Central',
    tab_id: 'interaction',
    Module: OfficeMechanic
  },
  stakeholders: {
    mechanic_id: 'stakeholders',
    label: 'Relaciones',
    tab_id: 'summary',
    Module: SummaryMechanic
  },
  map: {
    mechanic_id: 'map',
    label: 'Mapa',
    tab_id: 'map',
    Module: MapMechanic
  },
  scheduler: {
    mechanic_id: 'scheduler',
    label: 'Agenda',
    tab_id: 'schedule',
    Module: ScheduleMechanic
  },
  inbox: {
    mechanic_id: 'inbox',
    label: 'Correos',
    tab_id: 'emails',
    Module: EmailMechanic
  },
  documents: {
    mechanic_id: 'documents',
    label: 'Archivos',
    tab_id: 'documents',
    Module: DocumentsMechanic
  },
  data_export: {
    mechanic_id: 'data_export',
    label: 'Datos',
    tab_id: 'data_export',
    Module: DataExportMechanic
  },
  experimental_map: {
    mechanic_id: 'experimental_map',
    label: 'Mapa Experimental',
    tab_id: 'experimental_map',
    Module: ExperimentalMapMechanic
  }
};
