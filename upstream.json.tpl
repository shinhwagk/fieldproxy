{{- range service "multidatabasece-oracle" }}
- {{ .Address }}:{{ .Port }}
{{- end }}