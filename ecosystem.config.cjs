module.exports = {
  apps : [{
    name   : "agnes-enrichment",
    script : "scripts/mass_enrich_background.ts",
    interpreter: "node",
    node_args: "--experimental-strip-types"
  }]
}
