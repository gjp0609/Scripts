import { getTree } from './bookmarkApi';
import {
    applyExtraPatch,
    getAllBackupNodeMappings,
    getExtras,
    getPreferences,
    removeBackupNodeMappings,
    savePreferences,
} from './extraStore';
import { buildMetadataRepairPlan, type MetadataRepairReport } from './metadataMaintenanceModel';

export type { MetadataRepairReport } from './metadataMaintenanceModel';

export async function repairExtensionData(): Promise<MetadataRepairReport> {
    const [extras, preferences, mappings] = await Promise.all([
        getExtras(),
        getPreferences(),
        getAllBackupNodeMappings(),
    ]);
    // Storage references are written after their browser nodes, so read the tree after the storage snapshot.
    const tree = await getTree();
    const plan = buildMetadataRepairPlan({ tree, extras, preferences, mappings });
    const [latestExtras, latestPreferences, latestMappings] = await Promise.all([
        getExtras(),
        getPreferences(),
        getAllBackupNodeMappings(),
    ]);
    const safeExtraPatch = new Map(
        [...plan.extraPatch].filter(
            ([bookmarkId]) => JSON.stringify(latestExtras[bookmarkId]) === JSON.stringify(extras[bookmarkId]),
        ),
    );
    const latestMappingTargets = new Map(
        latestMappings.map((mapping) => [`${mapping.originId}\u0000${mapping.sourceId}`, mapping.targetId]),
    );
    const safeStaleMappings = plan.staleMappings.filter(
        (mapping) => latestMappingTargets.get(`${mapping.originId}\u0000${mapping.sourceId}`) === mapping.targetId,
    );
    const canRepairPreferences =
        plan.report.preferencesRepaired && JSON.stringify(latestPreferences) === JSON.stringify(preferences);

    await applyExtraPatch(safeExtraPatch);
    await removeBackupNodeMappings(safeStaleMappings);
    if (canRepairPreferences) await savePreferences(plan.repairedPreferences);

    return {
        ...plan.report,
        extrasRepaired: [...safeExtraPatch.values()].filter(Boolean).length,
        extrasRemoved: [...safeExtraPatch.values()].filter((extra) => !extra).length,
        mappingsRemoved: safeStaleMappings.length,
        preferencesRepaired: canRepairPreferences,
    };
}
