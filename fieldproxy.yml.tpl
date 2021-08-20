field: multidatabase-dbid
outtime: 60
upstream:
  {{- range service "multidatabasece-oracle" }}
  - {{ .Address }}:{{ .Port }}
  {{- end }}