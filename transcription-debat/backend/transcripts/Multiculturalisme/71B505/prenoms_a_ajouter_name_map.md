# Prénoms à ajouter à `Débats/multiculturalisme/71B505/name_map.json`

Fichier local, NON versionné (contient des prénoms réels). Généré le 2026-09-19.

Ces prénoms ont été entendus dans le débat mais sont absents de `name_map.json`. Pour le run
du 19/09, ils ont été masqués via `--redact-names` ; pour que les prochains runs les masquent
aussi (et de façon cohérente), ajoute-les à `name_map.json`. Si tu sais à quel participant
correspond un prénom (variante orale d'un pseudo), mets son label (`Interlocuteur N`) plutôt
que `[prénom]` — le masquage des variantes proches suivra automatiquement.

| Prénom entendu | Contexte (heure) | Probablement |
|---|---|---|
| Nissan | « Et justement, Nissan, tu parlais… » (≈ 18:53) | interpellation d'un participant |
| Nessa | « …qu'est-ce qui est en train de se passer, là, Nessa ? » (≈ 48:00) | interpellation |
| Vitov | « Et juste, Vitov, c'était… » (≈ 1:23:06) | interpellation |
| Cheyna | « quand tu disais Cheyna il faudrait… » (≈ 1:03:12) | interpellation (variante d'un pseudo ?) |
| Mylène | « je rejoins Mylène sur le fait… » (≈ 1:47:46) | participant cité |
| Alina | « …et même d'ailleurs chez Alina aussi » (≈ 31:18) | personne citée |
| Lilou | « si lui il voit genre Lilou… » (≈ 4:23) | pseudo cité (variante de « Loulou » ?) |
| Flavie | « c'est Flavie qui m'a fait mettre le mot dessus » | personne citée |
| Eubéka | « il y a Eubéka qui avait écrit les gros titres » | incertain (masqué par prudence) |
| Akshayima | « on s'était fait la remarque dans Akshayima » (≈ 18:53) | incertain (masqué par prudence) |
| Clavini | « en tout cas là il y a Clavini » (≈ 52:21) | incertain (masqué par prudence) |
| Althin | « tout le monde a tendance à dire, Althin, … » (≈ 1:23:48) | incertain (masqué par prudence) |

Entrées prêtes à copier dans `name_map.json` :

```json
"Nissan": "[prénom]", "Nessa": "[prénom]", "Vitov": "[prénom]", "Cheyna": "[prénom]",
"Mylène": "[prénom]", "Alina": "[prénom]", "Lilou": "[prénom]", "Flavie": "[prénom]",
"Eubéka": "[prénom]", "Akshayima": "[prénom]", "Clavini": "[prénom]", "Althin": "[prénom]"
```

Commande utilisée pour le run du 19/09 (depuis `backend/`) :

```
--redact-names "Antoine,Justine,Faustin,Flavie,Eubéka,Alina,Mylène,Nessa,Lilou,Cheyna,Akshayima,Nissan,Clavini,Vitov,Althin"
```
