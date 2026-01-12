import { MechanicRegistry } from './types';
import DataExportMechanic from './modules/DataExportMechanic';
import InnovatecCalendarMechanic from './modules/InnovatecCalendarMechanic';
import InnovatecEmailMechanic from './modules/InnovatecEmailMechanic';
import InnovatecExperimentalMapMechanic from './modules/InnovatecExperimentalMapMechanic';
import InnovatecOfficeMechanic from './modules/InnovatecOfficeMechanic';
import InnovatecSummaryMechanic from './modules/InnovatecSummaryMechanic';

export const INNOVATEC_REGISTRY: MechanicRegistry = {
  office: {
    mechanic_id: 'office',
    label: 'Oficina Central',
    tab_id: 'interaction',
    Module: InnovatecOfficeMechanic
  },
  inbox: {
    mechanic_id: 'inbox',
    label: 'Correos',
    tab_id: 'emails',
    Module: InnovatecEmailMechanic
  },
  calendar: {
    mechanic_id: 'calendar',
    label: 'Calendario',
    tab_id: 'calendar',
    Module: InnovatecCalendarMechanic
  },
  stakeholders: {
    mechanic_id: 'stakeholders',
    label: 'Stakeholders',
    tab_id: 'summary',
    Module: InnovatecSummaryMechanic
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
    Module: InnovatecExperimentalMapMechanic
  }
};
