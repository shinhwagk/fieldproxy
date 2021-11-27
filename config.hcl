consul {
  address = "127.0.0.1:8500"
}

log_level = "debug"

template {
  contents = "upstream:\n{{- range service \"multidatabasece-oracle\" }}\n  - {{ .Address }}:{{ .Port }}\n  {{- end }}"
  destination = "/etc/upstream.yml"
  exec {
    command = "curl http://fieldproxy:8000/refresh"
  }
}

template {
  contents = <<EOF
    upstream:
    {{- range service "multidatabasece-oracle" }}
    - {{ .Address }}:{{ .Port }}
    {{- end }}
  EOF
  destination = "/etc/upstream.yml"
  exec {
    command = "curl http://fieldproxy:8000/refresh"
  }
}