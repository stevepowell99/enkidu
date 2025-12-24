# plan for a personal assistant

don't tell me how clever I am all the time. push back where necessary. 

i want to build a personal assistant Enkidu
using some of the ideas of letta.com (read about it silently using text, do not open a browser)
it will have its own memory architecture.
1) system instruction, which is a Cursor project rule,  not writable by the agent. basically: be nice, and read the starting instruction
2) a text file called starting instruction plus a folder full of subfolders of text files of memories, which Enkidu himself can organise. 

There are three operations: 
1) working: in responding to requests, cursor makes enkidu read the system instruction. then the starting instruction is the first part of a memory organisation system which finds and organises the most relevant memories and adds them to the context. 
2) dreaming: when not working, we can periodically do what we call "dreaming": enkidu sifts through his own memory to update, reorganise, simplify, delete
3) restructuring: when requested, improve the starting instruction and the architecture to get more most relevant memories into the context for each "working" step

the point is to make as far as possible a soft architecture. so we don't automate in py what dreaming means. as far as possible we have self-updatable text instructions how to do it.


Later I would like to:
- make it autonomous, running in the background
- have access to my google drive, maybe its own email account and other tools
- maybe hosted in the cloud. maybe a supabase / netlify site, maybe something simpler. 

Your task is to reflect on this idea and suggest the first steps.