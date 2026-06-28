"""3-stage LLM Council orchestration."""

from typing import List, Dict, Any, Tuple, Optional
from .providers import query_models_parallel, query_model
from .firestore_memory import get_memory_prompt


async def stage1_collect_responses(
    user_query: str,
    conversation_history: List[Dict[str, Any]] = None,
    uid: Optional[str] = None,
    config: Any = None
) -> List[Dict[str, Any]]:
    """
    Stage 1: Collect individual responses from all council models.
    """
    messages = []

    # Inject persistent memory as system prompt (per-user if uid provided)
    memory_prompt = get_memory_prompt(uid) if uid else None
    if memory_prompt:
        messages.append({"role": "system", "content": memory_prompt})

    # Add conversation history
    if conversation_history:
        for msg in conversation_history:
            if msg.get('role') == 'user':
                messages.append({"role": "user", "content": msg.get('content', '')})
            elif msg.get('role') == 'assistant' and msg.get('stage3'):
                messages.append({"role": "assistant", "content": msg['stage3'].get('response', '')})

    # Add current query
    messages.append({"role": "user", "content": user_query})

    # Query all council models in parallel
    models_config = [m.dict() for m in config.council_models]
    responses = await query_models_parallel(models_config, config.keys, messages)

    stage1_results = []
    for model, response in responses.items():
        if response is not None:
            stage1_results.append({
                "model": model,
                "response": response.get('content', '')
            })

    return stage1_results


async def stage2_collect_rankings(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    conversation_history: List[Dict[str, Any]] = None,
    config: Any = None
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Stage 2: Each model ranks the anonymized responses.
    """
    labels = [chr(65 + i) for i in range(len(stage1_results))]

    label_to_model = {
        f"Response {label}": result['model']
        for label, result in zip(labels, stage1_results)
    }

    responses_text = "\n\n".join([
        f"Response {label}:\n{result['response']}"
        for label, result in zip(labels, stage1_results)
    ])

    ranking_prompt = f"""You are evaluating different responses to the following question:

Question: {user_query}

Here are the responses from different models (anonymized):

{responses_text}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:"""

    messages = [{"role": "user", "content": ranking_prompt}]

    models_config = [m.dict() for m in config.council_models]
    responses = await query_models_parallel(models_config, config.keys, messages)

    stage2_results = []
    for model, response in responses.items():
        if response is not None:
            full_text = response.get('content', '')
            parsed = parse_ranking_from_text(full_text)
            stage2_results.append({
                "model": model,
                "ranking": full_text,
                "parsed_ranking": parsed
            })

    return stage2_results, label_to_model


async def stage3_synthesize_final(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]],
    conversation_history: List[Dict[str, Any]] = None,
    uid: Optional[str] = None,
    config: Any = None
) -> Dict[str, Any]:
    """
    Stage 3: Chairman synthesizes final response.
    """
    stage1_text = "\n\n".join([
        f"Model: {result['model']}\nResponse: {result['response']}"
        for result in stage1_results
    ])

    stage2_text = "\n\n".join([
        f"Model: {result['model']}\nRanking: {result['ranking']}"
        for result in stage2_results
    ])

    context_summary = ""
    if conversation_history and len(conversation_history) > 0:
        context_parts = []
        for msg in conversation_history:
            if msg.get('role') == 'user':
                context_parts.append(f"User: {msg.get('content', '')}")
            elif msg.get('role') == 'assistant' and msg.get('stage3'):
                context_parts.append(f"Council: {msg['stage3'].get('response', '')[:500]}...")
        context_summary = f"\n\nCONVERSATION HISTORY:\n" + "\n".join(context_parts[-6:])

    chairman_prompt = f"""You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.{context_summary}

Current Question: {user_query}

STAGE 1 - Individual Responses:
{stage1_text}

STAGE 2 - Peer Rankings:
{stage2_text}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's current question. Consider:
- The conversation history and context (if any)
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:"""

    # Build messages for chairman — prepend memory if available
    chairman_messages = []
    memory_prompt = get_memory_prompt(uid) if uid else None
    if memory_prompt:
        chairman_messages.append({"role": "system", "content": memory_prompt})
    chairman_messages.append({"role": "user", "content": chairman_prompt})

    master_model = config.master_model.dict()
    response = await query_model(
        model=master_model["id"],
        provider=master_model["provider"],
        api_key=config.keys.get(master_model["provider"], ""),
        messages=chairman_messages
    )

    if response is None:
        return {
            "model": master_model["id"],
            "response": "Error: Unable to generate final synthesis."
        }

    return {
        "model": master_model["id"],
        "response": response.get('content', '')
    }


def parse_ranking_from_text(ranking_text: str) -> List[str]:
    """Parse the FINAL RANKING section from the model's response."""
    import re

    if "FINAL RANKING:" in ranking_text:
        parts = ranking_text.split("FINAL RANKING:")
        if len(parts) >= 2:
            ranking_section = parts[1]
            numbered_matches = re.findall(r'\d+\.\s*Response [A-Z]', ranking_section)
            if numbered_matches:
                return [re.search(r'Response [A-Z]', m).group() for m in numbered_matches]
            matches = re.findall(r'Response [A-Z]', ranking_section)
            return matches

    matches = re.findall(r'Response [A-Z]', ranking_text)
    return matches


def calculate_aggregate_rankings(
    stage2_results: List[Dict[str, Any]],
    label_to_model: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Calculate aggregate rankings across all judge models."""
    from collections import defaultdict

    model_positions = defaultdict(list)

    for ranking in stage2_results:
        parsed_ranking = parse_ranking_from_text(ranking['ranking'])
        for position, label in enumerate(parsed_ranking, start=1):
            if label in label_to_model:
                model_positions[label_to_model[label]].append(position)

    aggregate = []
    for model, positions in model_positions.items():
        if positions:
            aggregate.append({
                "model": model,
                "average_rank": round(sum(positions) / len(positions), 2),
                "rankings_count": len(positions)
            })

    aggregate.sort(key=lambda x: x['average_rank'])
    return aggregate


def generate_conversation_title(user_query: str) -> str:
    """Generate a short title from the first user message."""
    title = ' '.join(user_query.strip().split())
    if len(title) > 50:
        title = title[:47] + "..."
    return title if title else "Untitled Chat"


async def run_full_council(
    user_query: str,
    conversation_history: List[Dict[str, Any]] = None,
    uid: Optional[str] = None,
    config: Any = None
) -> Tuple[List, List, Dict, Dict]:
    """Run the complete 3-stage council process."""
    stage1_results = await stage1_collect_responses(user_query, conversation_history, uid=uid, config=config)

    if not stage1_results:
        return [], [], {
            "model": "error",
            "response": "All models failed to respond. Please try again."
        }, {}

    stage2_results, label_to_model = await stage2_collect_rankings(
        user_query, stage1_results, conversation_history, config=config
    )

    aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)

    stage3_result = await stage3_synthesize_final(
        user_query, stage1_results, stage2_results, conversation_history, uid=uid, config=config
    )

    metadata = {
        "label_to_model": label_to_model,
        "aggregate_rankings": aggregate_rankings
    }

    return stage1_results, stage2_results, stage3_result, metadata
