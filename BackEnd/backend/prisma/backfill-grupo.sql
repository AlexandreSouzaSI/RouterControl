-- Rode na VPS DEPOIS do deploy (a migration cria a coluna). Não apaga nada.
UPDATE "ContaPagar" c SET grupo='IMPOSTOS'
FROM "CategoriaContaPagar" k
WHERE c."categoriaId"=k.id AND (k.nome ILIKE 'imposto%' OR k.nome ILIKE 'gnre%' OR k.nome ILIKE 'tributo%');

UPDATE "ContaPagar" c SET grupo='SOCIOS'
FROM "CategoriaContaPagar" k
WHERE c."categoriaId"=k.id AND (k.nome ILIKE '%pro-labore%' OR k.nome ILIKE '%pró-labore%' OR k.nome ILIKE '%retirada s_cio%' OR k.nome ILIKE '%alimenta__o s_cio%' OR k.nome ILIKE '%empr_stimo%');

UPDATE "ContaPagar" SET "queuedForPaymentAt"=NULL WHERE grupo<>'FORNECEDORES';
