import { z } from "zod";

/**
 * Nivel "config estructural no sensible" (tech_stack.md §3, regla de decisión punto 2):
 * local al host, no depende de red externa para arrancar, no rompe nada si se filtra.
 * Vive en infra/config/bootstrap.yml (generado desde bootstrap.yml.template).
 */
export const StructuralConfigSchema = z.object({
  cloudflareTunnel: z.object({
    name: z.string().min(1),
    minecraftHostname: z.string().min(1),
    minecraftLocalPort: z.number().int().positive(),
    apiHostname: z.string().min(1),
    apiLocalPort: z.number().int().positive(),
  }),
  doppler: z.object({
    projectName: z.string().min(1),
    configName: z.string().min(1),
  }),
});

export type StructuralConfig = z.infer<typeof StructuralConfigSchema>;

/**
 * Nivel "secretos / config frágil" (tech_stack.md §3, regla de decisión punto 3):
 * si se corrompe rompe el arranque, requiere restart explícito. Vive en Doppler/.env,
 * nunca en el .yml versionado.
 */
export const SecretsConfigSchema = z.object({
  cloudflareApiToken: z.string().min(1),
  cloudflareAccountId: z.string().min(1),
  cloudflareZoneId: z.string().min(1),
  dopplerApiToken: z.string().min(1),
});

export type SecretsConfig = z.infer<typeof SecretsConfigSchema>;

export interface BootstrapConfig {
  structural: StructuralConfig;
  secrets: SecretsConfig;
}
