# Instruções e métodos

## Objetivo

O dashboard monitora a execução mensal de financiamentos associados ao Programa Amazônia Azul, com foco em valor contratado, beneficiários, contratos, participação de atividades vinculadas à Amazônia Azul, participação dos municípios elegíveis no total da base e participação feminina.

## Fontes de dados

A base de financiamento usada no pré-processamento é `FNE_AnexoI_Contratações_032026.xlsx`, aba `Dados_Anexo-I`. A classificação territorial é proveniente de `Tipologia Amazônia Azul (v5).xlsx`, aba `Base de dados`.

As bases brutas são usadas apenas localmente. O repositório público contém somente JSONs agregados e compactos, sem Excel, CSV ou registros individuais.

## Estrutura dos arquivos dos fundos

O script aceita a estrutura do Anexo I, com colunas de UF, município, data da contratação, CNAE, setor, programa, atividade, porte, finalidade, valor contratado, beneficiários, contratos, instituição operadora e sexo. Novos fundos podem ser empilhados desde que preservem essa estrutura e recebam identificador de origem.

## Elegibilidade territorial

A lista de municípios do arquivo de tipologia define os municípios elegíveis ao Programa Amazônia Azul. A coluna `Tipologia Amazônia Azul` desse arquivo é tratada como **Tipologia territorial Amazônia Azul**, com classes como Alta-Alta, Alta-Média, Alta-Baixa, Média-Alta, Média-Média, Média-Baixa e Baixa.

## Atividade vinculada e tipologia territorial

O dashboard separa duas classificações:

1. **Atividade vinculada à Amazônia Azul**: vem da coluna `TIPOLOGIA AMAZÔNIA AZUL` da base de financiamentos e identifica se a operação financiada pertence a uma atividade vinculada à Amazônia Azul.
2. **Tipologia territorial Amazônia Azul**: vem do arquivo de tipologia e caracteriza a prioridade territorial do município.

Essas variáveis não são intercambiáveis. A primeira classifica a operação; a segunda classifica o território.

## Indicadores básicos

Os indicadores centrais são calculados por soma:

- Valor contratado: soma de `VALOR CONTRATADO`.
- Beneficiários: soma de `QTDE DE BENEFICIÁRIOS`.
- Contratos: soma de `QUANTIDADE DE CONTRATOS`.

Os indicadores médios são razões entre esses totais, quando o denominador é válido.

## Participação das atividades Amazônia Azul nos municípios elegíveis

Para cada seleção, calcula-se:

- Valor das atividades Amazônia Azul nos municípios elegíveis dividido pelo valor total dos municípios elegíveis.
- Beneficiários das atividades Amazônia Azul nos municípios elegíveis divididos pelos beneficiários totais dos municípios elegíveis.
- Contratos das atividades Amazônia Azul nos municípios elegíveis divididos pelos contratos totais dos municípios elegíveis.

## Participação dos municípios elegíveis no total geral

O denominador inclui todos os municípios presentes na base de financiamento, elegíveis e não elegíveis. O numerador considera apenas os municípios elegíveis ao Programa Amazônia Azul.

## Participação das atividades Amazônia Azul no total geral

O denominador inclui o total geral da base filtrada. O numerador considera as operações marcadas como atividade vinculada à Amazônia Azul, independentemente de o município ser elegível.

## Participação feminina

O numerador feminino considera registros com sexo padronizado como `Mulheres`. Pessoas jurídicas, registros sem informação de sexo e categorias não informadas permanecem no denominador quando integram o total da execução.

## Janelas móveis

O mês de referência define a janela temporal:

- Mês: mês selecionado.
- Trimestre: mês selecionado e dois meses anteriores.
- Semestre: mês selecionado e cinco meses anteriores.
- Últimos 12 meses: mês selecionado e onze meses anteriores.

A variação é calculada contra a janela imediatamente anterior de mesmo tamanho. Quando a janela anterior é insuficiente ou possui denominador zero, a variação é indicada como não disponível.

## Crescimento e variações

- Variação absoluta: indicador da janela atual menos indicador da janela anterior.
- Crescimento percentual: variação absoluta dividida pelo indicador da janela anterior.
- Variação em pontos percentuais: participação atual menos participação anterior.

## Ranking Top 10

O ranking visual apresenta apenas o Top 10 para a dimensão e o indicador selecionados, respeitando os filtros globais. Categorias sem informação suficiente, denominadores nulos ou valores nulos são removidos para preservar a leitura executiva.

## Indicadores chave

A aba de indicadores chave reúne os totais de valor contratado, contratos e beneficiários, com barras empilhadas que separam a parcela vinculada e a parcela não vinculada à Amazônia Azul. A participação da Amazônia Azul é calculada como razão entre a parcela vinculada e o total da seleção filtrada para cada indicador. A aba também mantém a participação por tipologia territorial e o benchmarking territorial sintético.

## Benchmarking territorial

A ferramenta compara um território selecionado com um benchmark. A tabela sintética apresenta indicador, valor do território, valor do benchmark, diferença absoluta, diferença em pontos percentuais quando aplicável e diferença relativa.

Essa é a única tabela explícita de dados do dashboard.

## Mapas coropléticos por quartis

Os mapas usam limites administrativos municipais. Os níveis absolutos e participações são classificados por quartis da distribuição dos municípios elegíveis com dado válido.

Para mapas de variação, os valores positivos e negativos são classificados separadamente. Crescimentos usam escala azul; quedas usam escala laranja/vermelha; estabilidade é cinza; ausência de dado é cinza claro.

## Limitações de interpretação

Os indicadores refletem a execução registrada na base enviada e não representam avaliação causal de impacto. A existência de contratação em um município ou atividade não implica, isoladamente, efetividade econômica, adicionalidade, geração líquida de emprego ou alteração estrutural no território. Comparações de participação devem ser interpretadas com atenção à composição dos filtros, à sazonalidade e à disponibilidade de série histórica.


## Leitura dos modos percentuais

Nas visualizações de evolução temporal e comparação territorial, o modo **Percentual da janela** representa a taxa de variação do indicador em relação à janela imediatamente anterior de mesmo tamanho. A janela é definida pelo seletor global: mês, trimestre, semestre ou últimos 12 meses.

## Escalas dos mapas

Os mapas coropléticos usam classes por percentis entre os municípios elegíveis com dado válido. Quando o indicador apresenta valores positivos e negativos, os percentis são calculados separadamente para crescimentos e quedas, com estabilidade e ausência de dados em classes próprias.
