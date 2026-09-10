{{- define "eventrail.name" -}}eventrail{{- end -}}
{{- define "eventrail.fullname" -}}{{ printf "%s-eventrail" .Release.Name | trunc 63 | trimSuffix "-" }}{{- end -}}
{{- define "eventrail.labels" -}}
app.kubernetes.io/name: {{ include "eventrail.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Values.releaseVersion | quote }}
{{- end -}}
