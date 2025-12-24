---
title: benderdangersstochasticparrots2021
created: 2025-12-24T14:46:18Z
tags: source, verbatim
importance: 0
source: sources_ingest
source_id: d0fb84e8a088
original_path: content/zotero/benderDangersStochasticParrots2021.md
---

---
cssclass: research-note
type: "conferencePaper"
author: "Bender, Emily M.; Gebru, Timnit; McMillan-Major, Angelina; Shmitchell, Shmargaret"
title: "On the Dangers of Stochastic Parrots: Can Language Models Be Too Big? 🦜"
date: 2021-03-03
citekey: benderDangersStochasticParrots2021
---
Bender, E. M., Gebru, T., McMillan-Major, A., & Shmitchell, S. (2021). On the Dangers of Stochastic Parrots: Can Language Models Be Too Big? 🦜. _Proceedings of the 2021 ACM Conference on Fairness, Accountability, and Transparency_, 610–623. [https://doi.org/10.1145/3442188.3445922](https://doi.org/10.1145/3442188.3445922)


[online](http://zotero.org/users/17133746/items/JSCQBHA6) [local](zotero://select/library/items/JSCQBHA6) [pdf](file://C:\Users\Zoom\Zotero-cm\storage\JA7PWT7K\Bender%20et%20al.%20-%202021%20-%20On%20the%20Dangers%20of%20Stochastic%20Parrots%20Can%20Language.pdf)
 

 
#subject/!dezim

### Note
%% begin annotations %%

### Imported on 2025-05-18 10:43 pm

>[!quote|#ffff00] 
>
Timnit Gebru, [(p. 1)](zotero://open-pdf/library/items/JA7PWT7K?page=1&annotation=highlight-p1x113y275)

>[!quote|#ffff00] 
>
BERT, its variants, GPT-2/3, and others, most recently Switch-C, have pushed the boundaries of the possible both through architectu [(p. 1)](zotero://open-pdf/library/items/JA7PWT7K?page=1&annotation=highlight-p1x46y476)

>[!quote|#ffff00] 
>
How big is too big? What are the possible risks associated with this technology and what paths are available for mitigating those risks? [(p. 1)](zotero://open-pdf/library/items/JA7PWT7K?page=1&annotation=highlight-p1x46y410)

>[!quote|#ffff00] 
>
the frst consideration should be the environmental cost. Just as environmental impact scales with mod [(p. 1)](zotero://open-pdf/library/items/JA7PWT7K?page=1&annotation=highlight-p1x315y314)

>[!quote|#ffff00] 
>
In collecting ever larger datasets we risk incurring documentation debt. We recommend mitigating these risks by budgeting for curation and documentation at the start of a project and only creating datasets as large as can be sufciently documente [(p. 1)](zotero://open-pdf/library/items/JA7PWT7K?page=1&annotation=highlight-p1x310y227)

>[!quote|#ffff00] 
>
LMs are not performing natural language understanding (NLU), and only have success in tasks that can be approached by manipulating linguistic form [14 [(p. 1)](zotero://open-pdf/library/items/JA7PWT7K?page=1&annotation=highlight-p1x310y128)

>[!quote|#ffff00] 
>
Initially proposed by Shannon in 1949 [117], some of the earliest implemented LMs date to the early 1980s and were used as components in systems for automatic speech recognition (ASR), [(p. 2)](zotero://open-pdf/library/items/JA7PWT7K?page=2&annotation=highlight-p2x46y378)

>[!quote|#ffff00] 
>
Te next big step was the move towards using pretrained representations of the distribution of words (called word embeddings) in other (supervised) NLP tasks. Tese word vectors came from systems such as word2vec [85] and GloVe [98] and later LSTM models such as context2vec [82] and ELMo [99] and supported state of the art performance [(p. 2)](zotero://open-pdf/library/items/JA7PWT7K?page=2&annotation=highlight-p2x46y181)

>[!quote|#ffff00] 
>
While training the word embeddings required a (relatively) large amount of data, it reduced the amount of labeled data necessary for training on the various supervised tasks. For example, [99] showed that a model trained with ELMo reduced the necessary amount of training data needed [(p. 2)](zotero://open-pdf/library/items/JA7PWT7K?page=2&annotation=highlight-p2x46y104)

>[!quote|#ffff00] 
>
Increasing the number of model parameters, however, did not yield noticeable increases for LSTMs [e.g. 82]. Transformer models, on the other hand, have been able to continuously beneft from larger architectures and larger quantities of data. Devlin et [(p. 2)](zotero://open-pdf/library/items/JA7PWT7K?page=2&annotation=highlight-p2x310y438)

>[!quote|#ffff00] 
>
Te performance of these multilingual models across languages is an active area of research. Wu and Drezde [144] found that while mBERT does not perform equally well across all 104 languages in its training data, it performed beter at NER, POS tagging, and dependency parsing than monolingual models trained with comparable amounts of data for four low-resource languages. Conversely, [95] surveyed monolingual BERT models developed [(p. 2)](zotero://open-pdf/library/items/JA7PWT7K?page=2&annotation=highlight-p2x310y120)

>[!quote|#ffff00] 
>
over 90% of the world’s languages used by more than a billion people currently have litle to no support in terms of language technology. [(p. 3)](zotero://open-pdf/library/items/JA7PWT7K?page=3&annotation=highlight-p3x46y663)

>[!quote|#ffff00] 
>
Training a single BERT base model (without hyperparameter tuning) on GPUs was estimated to require as much energy as a trans-American fight [(p. 3)](zotero://open-pdf/library/items/JA7PWT7K?page=3&annotation=highlight-p3x46y218)

>[!quote|#ffff00] 
>
an increase in 0.1 BLEU score using neural architecture search for English to German translation results in an increase of $150,000 compute cost in addition to the carbon emissions. To encourage more equitable access to NLP research and reduce carbon footprint, the authors give recommendations to report training time and sensitivity to hyperparameters when the released model is meant to be re-trained for downstream use. Tey also urge governments to invest in compute clouds to provide equitable access to researchers  [(p. 3)](zotero://open-pdf/library/items/JA7PWT7K?page=3&annotation=highlight-p3x310y564)

>[!quote|#ffff00] 
>
In all cases, the voices of people most likely to hew to a hegemonic viewpoint are also more likely to be retained. In the case of US and UK English, this means that white supremacist and misogynistic, ageist, etc. views are overrepresented in the training data, not only exceeding their prevalence in the general population but also seting up models trained on these datasets to further amplify biases and harms. [(p. 4)](zotero://open-pdf/library/items/JA7PWT7K?page=4&annotation=highlight-p4x310y608)

>[!quote|#ffff00] 
>
recent surveys of Wikipedians fnd that only 8.8–15% are women or girls [9 [(p. 4)](zotero://open-pdf/library/items/JA7PWT7K?page=4&annotation=highlight-p4x313y498)

>[!quote|#ffff00] 
>
through blogging [71], which some older adults prefer over more popular social media sites for discussing sensitive topics [24]. Tese fora contain rich discussions about what constitutes age discrimination and the impacts thereof. However, a blogging community such as the one described by Lazar et al. is less likely to be found than other blogs that have more incoming and outgoing links. [(p. 4)](zotero://open-pdf/library/items/JA7PWT7K?page=4&annotation=highlight-p4x310y181)
%%this all seems a bit vague%%

>[!quote|#ffff00] 
>
Finally, the current practice of fltering datasets can further atenuate the voices of people from marginalized identities. Te training set for GPT-3 was a fltered version of the Common Crawl dataset, developed by training a classifer to pick out those documents [(p. 4)](zotero://open-pdf/library/items/JA7PWT7K?page=4&annotation=highlight-p4x310y137)

>[!quote|#ffff00] 
>
Te Colossal Clean Crawled Corpus [107], used to train a trillion parameter LM in [43], is cleaned, inter alia, by discarding any page containing one of a list of about 400 “Dirty, Naughty, Obscene or Otherwise Bad Words” [p.6].14 Tis list is overwhelmingly words related to sex, with a handful of racial slurs and words related to white supremacy (e.g. swastika, white power) included. While possibly efective at removing documents containing pornography (and the associated problematic stereotypes encoded in the language of such sites [125]) and certain kinds of hate speech, this approach will also undoubtedly atenuate, by suppressing such words as twink, the infuence of online spaces built by and for LGBTQ people.15 If we flter out the discourse of marginalized populations, we fail [(p. 5)](zotero://open-pdf/library/items/JA7PWT7K?page=5&annotation=highlight-p5x46y520)

>[!quote|#ffff00] 
>
as methodologies reliant on LMs run the risk of ‘value-lock’, where the LM-reliant technology reifes older, less-inclusive understandings. For instance, the Black Lives Mater movement (BLM) infuenced Wikipedia article generation and editing such that, as the BLM movement grew, articles covering shootings of Black people increased in coverage and were generated with reduced latency [135]. Importantly, articles describing past shootings and incidents of police brutality were created and updated as articles for new events were created, refecting how social movements make connections between events in time to form cohesive narratives [102]. More generally, Twyman et al. [135] highlight how social movements actively infuence framings and reframings of minority narratives [(p. 5)](zotero://open-pdf/library/items/JA7PWT7K?page=5&annotation=highlight-p5x46y132)

>[!quote|#ffff00] 
>
It is well established by now that large LMs exhibit various kinds of bias, including stereotypical associations [11, 12, 69, 119, 156, 157], or negative sentiment towards specifc groups [61]. Furthermore, we see the efects of intersectionality [34], where BERT, ELMo, GPT and GPT-2 encode more bias against identities marginalized along more than one dimension than would be expected based on just the combination of the bias along each of the axes [(p. 5)](zotero://open-pdf/library/items/JA7PWT7K?page=5&annotation=highlight-p5x310y352)

>[!quote|#ffff00] 
>
misdirected research efort, specifcally around the application of LMs to tasks intended to test for natural language understanding (NLU). As the very large Transformer LMs posted striking gains in the state of the art on various benchmarks intended to model meaning-sensitive tasks, and as initiatives like [142] made the models broadly accessible to researchers seeking to apply them, large quantities of research efort turned towards measuring how well BERT and its kin do on both existing and new benchmarks.19 Tis allocation of research efort brings with it an opportunity cost, on the one hand in terms of time not spent applying meaning capturing approaches to meaning sensitive tasks, and on the other hand in terms of time not spent exploring more efective ways of building technology with datasets of a size that can be carefully curated and available for a broader set of languages [(p. 6)](zotero://open-pdf/library/items/JA7PWT7K?page=6&annotation=highlight-p6x310y438)

>[!quote|#ffff00] 
>
If a large LM, endowed with hundreds of billions of parameters and trained on a very large dataset, can manipulate linguistic form well enough to cheat its way through tests meant to require language understanding, have we learned anything of value about how to build machine language understanding or have we been led down the garden path [(p. 7)](zotero://open-pdf/library/items/JA7PWT7K?page=7&annotation=highlight-p7x46y520)
%%ha%%

>[!quote|#ffff00] 
>
example illustrates GPT-3’s ability to produce coherent and on-topic text; the topic is connected to McGufe and Newhouse’s study of GPT-3 in the context of extremism, discussed below. We say seemingly coherent because coherence is in fact in the eye of the beholder. Our human understanding of coherence derives from our ability to recognize interlocutors’ beliefs [30, 31] and intentions [23, 33] within context [32]. Tat is, human language use [(p. 7)](zotero://open-pdf/library/items/JA7PWT7K?page=7&annotation=highlight-p7x46y122)
%%Chinese room%%

>[!quote|#ffff00] 
>
takes place between individuals who share common ground and are mutually aware of that sharing (and its extent), who have communicative intents which they use language to convey, and who model each others’ mental states as they communicate. As such, human communication relies on the interpretation of implicit meaning conveyed between individuals [(p. 7)](zotero://open-pdf/library/items/JA7PWT7K?page=7&annotation=highlight-p7x310y369)

>[!quote|#ffff00] 
>
Text generated by an LM is not grounded in communicative intent, any model of the world, or any model of the reader’s state of mind. It can’t have been, because the training data never included sharing thoughts with a listener, nor does the machine have the ability to do that. [(p. 7)](zotero://open-pdf/library/items/JA7PWT7K?page=7&annotation=highlight-p7x310y216)

>[!quote|#ffff00] 
>
increased fuency of MT output changes the perceived adequacy of that output [77]. [(p. 8)](zotero://open-pdf/library/items/JA7PWT7K?page=8&annotation=highlight-p8x310y159) %% end annotations %%

%% Import Date: 2025-05-18T22:43:21.595+01:00 %%

