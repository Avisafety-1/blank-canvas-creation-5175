type IncidentReporterVisibility = {
  reported_anonymously?: boolean | null;
  rapportert_av?: string | null;
};

type ReporterVisibilityContext = {
  hideReporterIdentity?: boolean;
  isAdmin?: boolean;
  isParentCompany?: boolean;
  departmentsEnabled?: boolean;
};

export const canSeeIncidentReporter = ({
  incident,
  hideReporterIdentity = false,
  isAdmin = false,
  isParentCompany = false,
  departmentsEnabled = false,
}: ReporterVisibilityContext & { incident: IncidentReporterVisibility }) => {
  const isAnonymous = !!incident.reported_anonymously || hideReporterIdentity;
  if (!isAnonymous) return true;
  return isAdmin && isParentCompany && departmentsEnabled;
};

export const getIncidentReporterDisplayName = ({
  incident,
  hideReporterIdentity = false,
  isAdmin = false,
  isParentCompany = false,
  departmentsEnabled = false,
}: ReporterVisibilityContext & { incident: IncidentReporterVisibility }) => {
  if (!incident.rapportert_av) return null;
  return canSeeIncidentReporter({ incident, hideReporterIdentity, isAdmin, isParentCompany, departmentsEnabled })
    ? incident.rapportert_av
    : "Anonym";
};