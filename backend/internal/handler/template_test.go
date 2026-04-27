package handler

import (
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
)

func TestTemplateCatalogItemOnlyExposesCompleteConfigContract(t *testing.T) {
	t.Parallel()

	partial := toTemplateCatalogItem(agenttemplate.Definition{
		ID:     "partial",
		Config: agenttemplate.ConfigContract{SchemaPath: "/opt/agent/config.json"},
	}, "us")
	if partial.Config != nil {
		t.Fatalf("partial config contract = %#v, want nil", partial.Config)
	}

	complete := toTemplateCatalogItem(agenttemplate.Definition{
		ID: "complete",
		Config: agenttemplate.ConfigContract{
			SchemaPath: " /opt/agent/config.json ",
			ScriptPath: " /opt/agent/config.sh ",
		},
	}, "us")
	if complete.Config == nil {
		t.Fatal("complete config contract = nil, want populated")
	}
	if complete.Config.SchemaPath != "/opt/agent/config.json" || complete.Config.ScriptPath != "/opt/agent/config.sh" {
		t.Fatalf("complete config contract = %#v, want trimmed standard paths", complete.Config)
	}
}
