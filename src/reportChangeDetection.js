// Champs à exclure de la comparaison "le PEI a-t-il changé depuis le dernier
// export ?" — sans quoi l'indicateur se déclencherait à tort :
// - reviewInDays, age, copyDeliveryOverdue : recalculés à partir de la date
//   du jour, pas du contenu du PEI (changent chaque jour sans aucune
//   modification réelle) ;
// - deliveredVersionId, narrativeReportUpdatedAt : métadonnées de suivi, pas
//   du contenu du PEI ;
// - consultationDate, consultationMethod, copyDeliveryDate,
//   acknowledgmentStatus : suivi de consultation/remise, jamais imprimé dans
//   le rapport PDF (voir server/pdfReport.js) — les modifier ne change rien
//   à ce qui serait réexporté.
export function stripVolatileFields(dto) {
  const {
    reviewInDays,
    age,
    copyDeliveryOverdue,
    deliveredVersionId,
    narrativeReportUpdatedAt,
    consultationDate,
    consultationMethod,
    copyDeliveryDate,
    acknowledgmentStatus,
    ...rest
  } = dto
  return rest
}

export function sameContent(a, b) {
  return JSON.stringify(stripVolatileFields(a)) === JSON.stringify(stripVolatileFields(b))
}
