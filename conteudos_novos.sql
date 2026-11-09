-- 1. INSERIR OS MÓDULOS
INSERT INTO public.custom_modules (id, subject_id, title, description, created_by, position) VALUES
(101, 'portugues', 'Módulo 1: Fundamentos da língua portuguesa', 'Alfabeto, sílabas, classes de palavras e pontuação.', auth.uid(), 1),
(102, 'portugues', 'Módulo 2: Gramática', 'Sujeito, predicado, verbos e concordância.', auth.uid(), 2),
(103, 'portugues', 'Módulo 3: Interpretação de texto', 'Fato, opinião, ironia e fake news.', auth.uid(), 3),
(104, 'portugues', 'Módulo 4: Produção textual', 'Parágrafos, argumentação e redação.', auth.uid(), 4),

(201, 'matematica', 'Módulo 1: Matemática básica', 'Números, quatro operações e expressões.', auth.uid(), 1),
(202, 'matematica', 'Módulo 2: Frações e porcentagem', 'Frações, decimais, descontos e juros.', auth.uid(), 2),
(203, 'matematica', 'Módulo 3: Matemática aplicada', 'Sistema monetário, medidas e contas do dia a dia.', auth.uid(), 3),
(204, 'matematica', 'Módulo 4: Matemática intermediária', 'Equações, geometria e estatística.', auth.uid(), 4),

(301, 'historia', 'Módulo 1: História geral', 'Pré-História, Idade Média e Iluminismo.', auth.uid(), 1),
(302, 'historia', 'Módulo 2: História do Brasil', 'Povos indígenas, colonização e escravidão.', auth.uid(), 2),
(303, 'historia', 'Módulo 3: História contemporânea', 'Guerras mundiais, ditadura e redemocratização.', auth.uid(), 3),

(401, 'geografia', 'Módulo 1: Fundamentos', 'Espaço geográfico, mapas e fusos.', auth.uid(), 1),
(402, 'geografia', 'Módulo 2: Geografia física', 'Relevo, clima, biomas e aquecimento global.', auth.uid(), 2),
(403, 'geografia', 'Módulo 3: Geografia humana', 'População, urbanização e economia.', auth.uid(), 3),
(404, 'geografia', 'Módulo 4: Geografia do Brasil', 'Regiões, semiárido nordestino e problemas ambientais.', auth.uid(), 4),

(501, 'conhecimentos', 'Módulo 1: Sociedade e cidadania', 'Direitos, deveres, democracia e serviços públicos.', auth.uid(), 1),
(502, 'conhecimentos', 'Módulo 2: Economia e sociedade', 'Inflação, impostos, desigualdade e consumo.', auth.uid(), 2),
(503, 'conhecimentos', 'Módulo 3: Ciências e conhecimentos do cotidiano', 'Corpo humano, vacinas, água e energia.', auth.uid(), 3),

(601, 'tecnologia', 'Módulo 1: Informática básica', 'Hardware, software, pastas e editores.', auth.uid(), 1),
(602, 'tecnologia', 'Módulo 2: Internet e segurança', 'Redes, golpes virtuais, phishing e Pix.', auth.uid(), 2),
(603, 'tecnologia', 'Módulo 3: Inteligência artificial', 'ChatGPT, ética, deepfakes e mercado.', auth.uid(), 3),
(604, 'tecnologia', 'Módulo 4: Tecnologia e futuro', 'Robótica, automação e inclusão digital.', auth.uid(), 4),

(701, 'redacao', 'Módulo 1: Aprender a escrever', 'Organização de ideias, parágrafos e conectivos.', auth.uid(), 1),
(702, 'redacao', 'Módulo 2: Redação dissertativa', 'Estrutura, tese, argumentação e proposta de intervenção.', auth.uid(), 2),
(703, 'redacao', 'Módulo 3: Atualidades e Temas', 'Temas para treinar e acompanhar semanalmente.', auth.uid(), 3);


-- 2. INSERIR AS AULAS (Cada aula é um tópico do PDF)

-- Português
INSERT INTO public.custom_lessons (module_id, title, lead, sections_json, summary, question_prompt, question_option_a, question_option_b, question_option_c, question_option_d, question_answer) VALUES
(101, 'Alfabeto e formação das palavras', 'Vamos entender como as letras se juntam.', '[{"title":"O Alfabeto","paragraphs":["O alfabeto oficial tem 26 letras."],"example":""}]', 'O alfabeto tem 26 letras.', 'Quantas letras tem o alfabeto?', '23', '24', '26', '27', 2),
(101, 'Separação de sílabas', 'Aprender a separar as palavras.', '[{"title":"Sílabas","paragraphs":["Cada som é uma sílaba."],"example":""}]', 'Sílabas são os sons das palavras.', 'Quantas sílabas tem a palavra casa?', '1', '2', '3', '4', 1),
(101, 'Substantivos, adjetivos e verbos', 'As classes que usamos todo dia.', '[{"title":"Classes","paragraphs":["Substantivo nomeia. Adjetivo caracteriza. Verbo indica ação."],"example":""}]', 'Substantivos, adjetivos e verbos.', 'Qual é adjetivo?', 'Casa', 'Bonita', 'Correr', 'Ele', 1),

-- Matemática
(201, 'Números naturais', 'Contando as coisas.', '[{"title":"Naturais","paragraphs":["São os números inteiros positivos: 0, 1, 2, 3..."],"example":""}]', 'Números a partir do zero.', 'Qual o menor natural?', '1', '0', '-1', 'Nenhum', 1),
(201, 'Adição, Subtração, Multiplicação e Divisão', 'As quatro operações.', '[{"title":"Operações","paragraphs":["+ - x /"],"example":""}]', 'As quatro operações básicas.', 'Quanto é 2+2?', '3', '4', '5', '6', 1),

-- História
(302, 'Povos indígenas antes da colonização', 'A história antes de 1500.', '[{"title":"Povos originários","paragraphs":["O Brasil já era habitado."],"example":""}]', 'O Brasil já tinha donos.', 'Quem habitava o Brasil antes de 1500?', 'Europeus', 'Indígenas', 'Africanos', 'Ninguém', 1),

-- Geografia
(401, 'Espaço geográfico', 'O que é geografia?', '[{"title":"Espaço","paragraphs":["O espaço transformado pelo homem."],"example":""}]', 'O espaço é modificado.', 'O que estuda a geografia?', 'O passado', 'O espaço', 'Os números', 'As palavras', 1),

-- Tecnologia
(601, 'Hardware e software', 'O que é o quê?', '[{"title":"Diferença","paragraphs":["Hardware é a parte física. Software é o programa."],"example":""}]', 'Hardware é físico, software é programa.', 'O mouse é o quê?', 'Software', 'Hardware', 'Programa', 'Nuvem', 1),
(603, 'O que é inteligência artificial?', 'Entendendo a IA.', '[{"title":"IA","paragraphs":["Sistemas que simulam a inteligência humana."],"example":""}]', 'IA simula a inteligência.', 'O ChatGPT é uma IA?', 'Sim', 'Não', 'Talvez', 'É um site', 0);