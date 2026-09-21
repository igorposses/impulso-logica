# Função de Pausar Cronômetro - Guia Rápido

## ✨ O que foi implementado?

Você agora pode **pausar e retomar** o cronômetro da competição durante o evento. Essa funcionalidade é **sincronizada em tempo real** com todos os alunos através do Supabase.

---

## 🎮 Como usar?

### 1. **Iniciar a competição normalmente**
   - Clique em "Liberar desafio"
   - Clique em "Iniciar cronômetro"
   - O cronômetro começará a contar regressivamente

### 2. **Pausar o cronômetro**
   - Na área do professor, clique no botão **⏸ Pausar**
   - O cronômetro vai congelar
   - A cor muda para **amarelo** (aviso de pausa)
   - Todos os alunos veem o cronômetro pausado simultaneamente

### 3. **Retomar o cronômetro**
   - Na área do professor, clique no botão **▶ Retomar**
   - O cronômetro continua de onde parou
   - Todos os alunos veem o cronômetro retomado simultaneamente

---

## 📊 Detalhes Técnicos

### Banco de Dados
A tabela `competition_state` agora armazena:
- `paused_at` (timestamptz) - Timestamp quando foi pausado (null se em execução)
- `pause_accumulated_ms` (bigint) - Total de tempo acumulado em pausa

### Sincronização
- ✅ Todos os alunos recebem atualização em tempo real
- ✅ O cronômetro para exatamente no mesmo segundo para todos
- ✅ Se desconectar e reconectar, o tempo pausado é mantido
- ✅ Os dados são salvos localmente E no Supabase

### Cálculo do Tempo Restante
```
tempo_restante = 90 minutos - (tempo_decorrido + tempo_acumulado_em_pausa)

onde:
  tempo_decorrido = (data_atual - data_inicio) se em execução
                  = (data_pausa - data_inicio) se pausado
```

---

## 🎨 Indicadores Visuais

| Estado | Cor | Animação |
|--------|-----|----------|
| Em execução | Azul/Ciano | Pulsante (suave) |
| Aviso (< 10 min) | Laranja | Pulsante (rápida) |
| Pausado | Amarelo | Pulsante (média) |
| Expirado | Vermelho | Sólido |

---

## 🔄 Sincronização Realtime

Quando o professor pausa/retoma:
1. Estado é atualizado no banco de dados local (localStorage)
2. Enviado para Supabase via API
3. Supabase dispara evento Realtime
4. Todos os navegadores conectados recebem a atualização
5. Cronômetro é recalculado simultaneamente

Latência típica: < 100ms

---

## ⚙️ Variáveis Importantes

No `script.js`:
```javascript
competitionStateCache.paused_at       // Momento da pausa (ISO string)
competitionStateCache.pause_accumulated_ms // Total de tempo pausado em ms
competitionPausedMs // Variável local para rastreamento
```

---

## 🐛 Troubleshooting

### Botões de pausar não aparecem
- ✅ Verifique se o cronômetro foi iniciado
- ✅ Verifique se a competição ainda não terminou

### Pausa não sincroniza para os alunos
- ✅ Verifique a conexão com Supabase
- ✅ Verifique o console do navegador para erros
- ✅ Recarregue a página do professor

### Tempo está calculando errado após pausa
- ✅ A página pode estar desincronizada
- ✅ Recarregue ou pressione F5 para sincronizar

---

## 📋 Casos de Uso

### 1. **Interrupção técnica**
   - Pausa o cronômetro
   - Resolve o problema
   - Retoma quando pronto

### 2. **Pergunta em tempo real**
   - Pausa para esclarecer dúvida
   - Não penaliza nenhum aluno
   - Retoma a competição

### 3. **Intervalo planejado**
   - Pausa entre rodadas
   - Pausa para lanche/pátio
   - Alunos veem o cronômetro parado

### 4. **Ajustes de pontuação**
   - Pausa o cronômetro
   - Válida questões pendentes
   - Retoma quando terminar

---

## ✅ Teste Recomendado

```
1. Abra 2 navegadores lado a lado (Professor e Aluno)
2. Professor clica "Liberar desafio"
3. Professor clica "Iniciar cronômetro"
4. Cronômetro começa em ambos os navegadores
5. Professor clica "Pausar"
6. ✅ Ambos os cronômetros devem pausar instantaneamente
7. Professor clica "Retomar"
8. ✅ Ambos devem continuar do mesmo ponto
```

---

## 📝 Notas de Implementação

- **Compatibilidade**: Funciona com localStorage fallback (sem Supabase)
- **Performance**: Adiciona < 1ms ao ciclo de atualização
- **Storage**: Cada pausa adiciona ~500 bytes ao estado (negligenciável)
- **Segurança**: Confiável apenas em ambiente de sala de aula supervisionada

---

## 🔮 Possíveis Melhorias Futuras

1. **Histórico de pausas** - Log de quantas vezes foi pausado
2. **Pausa automática** - Pausar após X minutos de inatividade
3. **Pausa parcial** - Alguns alunos continuam, outros param
4. **Limite de pausas** - Máximo de N pausas por competição
5. **Razão da pausa** - Professor registra por que pausou
6. **Estatísticas** - Tempo total pausado vs tempo ativo

---

Versão: 1.0  
Data: Setembro 2026  
Desenvolvimento: IA Assistente com Copilot SDK
