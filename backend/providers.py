import httpx
from typing import List, Dict, Any, Optional

async def query_openai_compatible(
    url: str,
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0
) -> Optional[Dict[str, Any]]:
    """Generic client for OpenAI-compatible endpoints (Groq, Hugging Face)."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": model,
        "messages": messages,
    }
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            
            data = response.json()
            message = data['choices'][0]['message']
            
            return {
                'content': message.get('content', ''),
                'reasoning_details': message.get('reasoning_details')
            }
    except httpx.HTTPStatusError as e:
        error_text = e.response.text
        print(f"Error querying {url} for model {model}: HTTP {e.response.status_code} - {error_text}")
        return None
    except Exception as e:
        print(f"Error querying {url} for model {model}: {e}")
        return None


async def query_gemini(
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0
) -> Optional[Dict[str, Any]]:
    """Client for Google Gemini API."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    # Extract system messages for Gemini's system_instruction field
    system_parts = [m["content"] for m in messages if m.get("role") == "system"]

    # Convert non-system messages to Gemini format
    gemini_contents = []
    for msg in messages:
        if msg.get("role") == "system":
            continue  # handled via system_instruction
        role = "user" if msg["role"] == "user" else "model"
        gemini_contents.append({
            "role": role,
            "parts": [{"text": msg["content"]}]
        })

    payload = {"contents": gemini_contents}
    if system_parts:
        payload["system_instruction"] = {
            "parts": [{"text": "\n\n".join(system_parts)}]
        }
    
    headers = {
        "Content-Type": "application/json",
    }
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            
            data = response.json()
            if "candidates" in data and len(data["candidates"]) > 0:
                # Some candidates might be blocked by safety filters and lack "content"
                if "content" in data["candidates"][0] and "parts" in data["candidates"][0]["content"]:
                    content = data["candidates"][0]["content"]["parts"][0]["text"]
                    return {
                        'content': content
                    }
                else:
                    return {'content': f"Gemini API blocked response: {data['candidates'][0].get('finishReason', 'Unknown reason')}"}
            return {'content': f"Gemini API Error: No candidates returned. Response: {data}"}
    except httpx.HTTPStatusError as e:
        error_text = e.response.text
        print(f"Error querying Gemini model {model}: HTTP {e.response.status_code} - {error_text}")
        return None
    except Exception as e:
        print(f"Error querying Gemini model {model}: {e}")
        return None


async def query_model(
    model: str,
    provider: str,
    api_key: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0
) -> Optional[Dict[str, Any]]:
    """Route query to the correct provider."""
    if not api_key:
        print(f"No API key provided for {provider}")
        return None
        
    if provider == "groq":
        return await query_openai_compatible(
            url="https://api.groq.com/openai/v1/chat/completions",
            api_key=api_key,
            model=model,
            messages=messages,
            timeout=timeout
        )
    elif provider == "gemini":
        return await query_gemini(
            api_key=api_key,
            model=model,
            messages=messages,
            timeout=timeout
        )
    elif provider == "huggingface":
        return await query_openai_compatible(
            url=f"https://api-inference.huggingface.co/models/{model}/v1/chat/completions",
            api_key=api_key,
            model=model,
            messages=messages,
            timeout=timeout
        )
    elif provider == "cerebras":
        return await query_openai_compatible(
            url="https://api.cerebras.ai/v1/chat/completions",
            api_key=api_key,
            model=model,
            messages=messages,
            timeout=timeout
        )
    elif provider == "openrouter":
        return await query_openai_compatible(
            url="https://openrouter.ai/api/v1/chat/completions",
            api_key=api_key,
            model=model,
            messages=messages,
            timeout=timeout
        )
    else:
        print(f"Unknown provider: {provider}")
        return None


async def query_models_parallel(
    models_config: List[Dict[str, str]],
    keys: Dict[str, str],
    messages: List[Dict[str, str]],
    max_concurrent: int = 5
) -> Dict[str, Optional[Dict[str, Any]]]:
    """
    Query multiple models in parallel across different providers, with a concurrency limit.
    
    Args:
        models_config: List of dicts with 'id' and 'provider'
        keys: Dict mapping provider names to API keys
        messages: List of messages
        max_concurrent: Maximum number of simultaneous API requests
        
    Returns:
        Dict mapping model id to response
    """
    import asyncio

    # Filter to only models where we have a key for the provider
    valid_models = []
    for model_info in models_config:
        provider = model_info.get("provider")
        if provider in keys and keys[provider]:
            valid_models.append(model_info)

    if not valid_models:
        return {}

    sem = asyncio.Semaphore(max_concurrent)

    async def _query_with_sem(model_id: str, provider: str, api_key: str):
        async with sem:
            # We add a small retry wrapper here for momentary 429s
            for attempt in range(3):
                res = await query_model(model_id, provider, api_key, messages)
                # If we got a response, return it
                if res is not None:
                    return res
                # If it's None, it could be a 429. Wait a bit and retry.
                if attempt < 2:
                    await asyncio.sleep(2 * (attempt + 1))
            return None

    # Create tasks
    tasks = []
    for model_info in valid_models:
        model_id = model_info["id"]
        provider = model_info["provider"]
        api_key = keys[provider]
        tasks.append(_query_with_sem(model_id, provider, api_key))

    # Wait for all to complete
    responses = await asyncio.gather(*tasks)

    # Map model ids to responses
    return {model_info["id"]: response for model_info, response in zip(valid_models, responses)}
